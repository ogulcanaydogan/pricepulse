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
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Attr, Key

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])
sns_client = boto3.client("sns")
SNS_TOPIC = os.environ.get("SNS_TOPIC")


def _decimal_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Object of type {type(value)} is not JSON serializable")


def _response(status_code: int, body: Any) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
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

    user_id = _get_user_id(event)
    if not user_id:
        return _response(401, {"message": "Unauthorized"})

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    route_key = event.get("requestContext", {}).get("routeKey") or f"{http_method} {event.get('rawPath', '/') }"

    if http_method == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Authorization,Content-Type",
                "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            },
        }

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

    table.put_item(Item=item)
    return _response(201, item)


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
