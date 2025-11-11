"""Lambda handler implementing CRUD operations for PricePulse items.

The function expects requests proxied from API Gateway HTTP APIs (payload v2.0)
and uses DynamoDB to store the watch list per user. Authentication information
is retrieved from the `requestContext.authorizer.jwt.claims.sub` claim that is
populated by a Cognito JWT authorizer. For local testing you can pass a
`X-User-Id` header and the handler will fallback to that identifier.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import boto3
from boto3.dynamodb.conditions import Attr, Key

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])
sns_client = boto3.client("sns")
SNS_TOPIC = os.environ.get("SNS_TOPIC")
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-User-Id",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
}
CURRENCY_SYMBOL_MAP = {
    "£": "GBP",
    "€": "EUR",
    "$": "USD",
    "₺": "TRY",
    "₽": "RUB",
}


def _decimal_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Object of type {type(value)} is not JSON serializable")


def _response(status_code: int, body: Any) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            **CORS_HEADERS,
        },
        "body": json.dumps(body, default=_decimal_default),
    }


def _get_user_id(event: Dict[str, Any]) -> Optional[str]:
    try:
        return event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except KeyError:
        pass

    headers = event.get("headers") or {}
    user_id = headers.get("x-user-id") or headers.get("X-User-Id")
    if user_id:
        LOGGER.warning("Falling back to X-User-Id header for unauthenticated request")
    return user_id


def _parse_body(event: Dict[str, Any]) -> Dict[str, Any]:
    body = event.get("body")
    if not body:
        return {}
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")  # type: ignore[name-defined]
    return json.loads(body)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    LOGGER.info("Received event: %s", json.dumps(event))

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

    if http_method == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": CORS_HEADERS,
        }

    user_id = _get_user_id(event)
    if not user_id:
        return _response(401, {"message": "Unauthorized"})

    route_key = event.get("requestContext", {}).get("routeKey") or f"{http_method} {event.get('rawPath', '/') }"

    if route_key == "POST /test-extract":
        body = _parse_body(event)
        return _test_extract(body)

    if http_method == "GET" and route_key.startswith("GET /items/"):
        item_id = event.get("pathParameters", {}).get("item_id")
        return _get_item(user_id, item_id)
    if http_method == "GET":
        return _list_items(user_id)
    if http_method == "POST":
        body = _parse_body(event)
        return _create_item(user_id, body)
    if http_method == "PUT":
        body = _parse_body(event)
        item_id = event.get("pathParameters", {}).get("item_id")
        return _update_item(user_id, item_id, body)
    if http_method == "DELETE":
        item_id = event.get("pathParameters", {}).get("item_id")
        return _delete_item(user_id, item_id)

    return _response(405, {"message": f"Unsupported method {http_method}"})


def _list_items(user_id: str) -> Dict[str, Any]:
    response = table.query(
        KeyConditionExpression=Key("user_id").eq(user_id),
        ScanIndexForward=False,
    )
    return _response(200, response.get("Items", []))


def _get_item(user_id: str, item_id: Optional[str]) -> Dict[str, Any]:
    if not item_id:
        return _response(400, {"message": "item_id path parameter is required"})
    response = table.get_item(Key={"user_id": user_id, "item_id": item_id})
    item = response.get("Item")
    if not item:
        return _response(404, {"message": "Item not found"})
    return _response(200, item)


def _create_item(user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    required_fields = ["url", "target_price"]
    missing = [field for field in required_fields if field not in body]
    if missing:
        return _response(400, {"message": f"Missing required fields: {', '.join(missing)}"})

    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "user_id": user_id,
        "item_id": item_id,
        "url": body["url"],
        "product_name": body.get("product_name"),
        "target_price": Decimal(str(body["target_price"])),
        "status": body.get("status", "ACTIVE"),
        "last_checked": body.get("last_checked", now),
        "created_at": now,
        "frequency_minutes": body.get("frequency_minutes", 720),
        "notification_channel": body.get("notification_channel", "email"),
    }

    if body.get("last_price") is not None:
        item["last_price"] = Decimal(str(body["last_price"]))
    if body.get("added_by"):
        item["added_by"] = body["added_by"]
    if body.get("notification_email"):
        item["notification_email"] = body["notification_email"]
    if body.get("currency_code"):
        item["currency_code"] = body["currency_code"]

    table.put_item(Item=item)
    return _response(201, item)


def _test_extract(body: Dict[str, Any]) -> Dict[str, Any]:
    url = (body.get("url") or "").strip()
    if not url:
        return _response(400, {"message": "url is required"})

    normalized_url = _normalize_url(url)

    try:
        metadata = _fetch_url_metadata(normalized_url)
        return _response(200, metadata)
    except Exception as error:  # pylint: disable=broad-except
        LOGGER.exception("Failed to extract metadata for %s", normalized_url)
        return _response(502, {"message": "Unable to detect product details", "detail": str(error)})


def _normalize_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme:
        parsed = urlparse(f"https://{url}")
    return parsed.geturl()


def _fetch_url_metadata(url: str) -> Dict[str, Any]:
    parsed = urlparse(url)
    store = (parsed.netloc or "").replace("www.", "")

    html = _download_html(url)

    title = (
        _extract_meta_content(html, "og:title")
        or _extract_meta_content(html, "twitter:title")
        or _extract_title(html)
        or store
    )

    price, currency_code = _extract_price(html)

    return {
        "store": store or parsed.netloc,
        "product_name": title.strip()[:256] if title else store,
        "current_price": price,
        "currency_code": currency_code,
    }


def _download_html(url: str) -> str:
    # Simple retry wrapper to tolerate transient remote errors (5xx, timeouts)
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; PricePulseBot/1.0)"})
    retries = 3
    delay_seconds = 1
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urlopen(request, timeout=10) as response:  # nosec B310
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="ignore")
        except HTTPError as http_err:
            # For 4xx errors, don't retry; surface the error immediately
            status = getattr(http_err, 'code', None)
            last_error = http_err
            if status and 400 <= status < 500:
                LOGGER.warning("HTTP Error %s fetching %s (not retrying)", status, url)
                raise
            LOGGER.warning("Transient HTTP error fetching %s (attempt %s/%s): %s", url, attempt, retries, http_err)
        except URLError as url_err:
            last_error = url_err
            LOGGER.warning("URL error fetching %s (attempt %s/%s): %s", url, attempt, retries, url_err)

        # Backoff before retrying
        if attempt < retries:
            import time

            time.sleep(delay_seconds * attempt)

    # If we reach here, all retries failed
    LOGGER.error("Failed to download HTML for %s after %s attempts", url, retries)
    raise last_error or Exception("Failed to download HTML")


def _extract_meta_content(html: str, property_name: str) -> Optional[str]:
    pattern = re.compile(
        rf'<meta[^>]+(?:property|name)\s*=\s*["\']{re.escape(property_name)}["\'][^>]+content\s*=\s*["\'](.*?)["\']',
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(html)
    if match:
        return match.group(1)
    return None


def _extract_title(html: str) -> Optional[str]:
    match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip()
    return None


def _extract_price(html: str) -> Tuple[Optional[float], Optional[str]]:
    price_pattern = re.compile(r"(£|€|\$|₺|₽)\s?([0-9]+(?:[.,][0-9]{1,2})?)", re.IGNORECASE)
    match = price_pattern.search(html)
    if not match:
        return None, None
    symbol = match.group(1)
    value = match.group(2).replace(",", ".")
    try:
        return float(value), CURRENCY_SYMBOL_MAP.get(symbol)
    except ValueError:
        return None, CURRENCY_SYMBOL_MAP.get(symbol)


def _update_item(user_id: str, item_id: Optional[str], body: Dict[str, Any]) -> Dict[str, Any]:
    if not item_id:
        return _response(400, {"message": "item_id path parameter is required"})

    update_expression_parts: List[str] = []
    expression_values: Dict[str, Any] = {}
    expression_names: Dict[str, str] = {}

    for key, value in body.items():
        placeholder = f":{key}"
        name_placeholder = f"#{key}"
        update_expression_parts.append(f"{name_placeholder} = {placeholder}")
        expression_names[name_placeholder] = key
        if key in {"target_price", "last_price"}:
            expression_values[placeholder] = Decimal(str(value))
        else:
            expression_values[placeholder] = value

    if not update_expression_parts:
        return _response(400, {"message": "No fields provided for update"})

    try:
        response = table.update_item(
            Key={"user_id": user_id, "item_id": item_id},
            UpdateExpression="SET " + ", ".join(update_expression_parts),
            ExpressionAttributeNames=expression_names,
            ExpressionAttributeValues=expression_values,
            ConditionExpression=Attr("item_id").exists(),
            ReturnValues="ALL_NEW",
        )
    except table.meta.client.exceptions.ConditionalCheckFailedException:  # type: ignore[attr-defined]
        return _response(404, {"message": "Item not found"})

    item = response.get("Attributes")

    if body.get("notify_now") and SNS_TOPIC:
        sns_client.publish(
            TopicArn=SNS_TOPIC,
            Message=json.dumps({
                "type": "manual_test",
                "user_id": user_id,
                "item_id": item_id,
                "target_price": item.get("target_price"),
                "last_price": item.get("last_price"),
            }, default=_decimal_default),
        )

    return _response(200, item)


def _delete_item(user_id: str, item_id: Optional[str]) -> Dict[str, Any]:
    if not item_id:
        return _response(400, {"message": "item_id path parameter is required"})

    try:
        table.delete_item(
            Key={"user_id": user_id, "item_id": item_id},
            ConditionExpression=Attr("item_id").exists(),
        )
    except table.meta.client.exceptions.ConditionalCheckFailedException:  # type: ignore[attr-defined]
        return _response(404, {"message": "Item not found"})
    return _response(204, {"message": "Item deleted"})
