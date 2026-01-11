"""PricePulse worker Lambda.

This function runs on a schedule to fetch the current price of tracked items and
sends a notification when the price drops below the user defined target.
The implementation focuses on maintainability and includes graceful fallback in
case a price cannot be extracted.
"""
from __future__ import annotations

import json
import logging
import os
import random
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3
import requests
from bs4 import BeautifulSoup
from boto3.dynamodb.conditions import Attr

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

DYNAMO_TABLE = os.environ["TABLE_NAME"]
SNS_TOPIC = os.environ["SNS_TOPIC"]

session = boto3.Session()
dynamodb = session.resource("dynamodb")
table = dynamodb.Table(DYNAMO_TABLE)
sns_client = session.client("sns")


@dataclass
class Item:
    user_id: str
    item_id: str
    url: str
    target_price: Decimal
    notification_channel: str = "email"
    product_name: Optional[str] = None
    last_price: Optional[Decimal] = None
    last_checked: Optional[str] = None
    status: str = "ACTIVE"


USER_AGENT_CHOICES = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/118.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
]


PRICE_PATTERNS = [
    re.compile(r"\$\s?(\d+[\d,]*\.?\d*)"),
    re.compile(r"€\s?(\d+[\d,]*\.?\d*)"),
    re.compile(r"£\s?(\d+[\d,]*\.?\d*)"),
    re.compile(r"₺\s?(\d+[\d,]*\.?\d*)"),
    re.compile(r"₽\s?(\d+[\d,]*\.?\d*)"),
]


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    LOGGER.info("Starting price scan")

    items = _load_active_items()
    LOGGER.info("Loaded %s active items", len(items))

    notifications_sent = 0
    for item in items:
        try:
            current_price = _fetch_price(item.url)
            LOGGER.info("Fetched price %s for item %s", current_price, item.item_id)
        except Exception as exc:  # noqa: BLE001 - capture failures per item
            LOGGER.exception("Failed to fetch price for %s: %s", item.url, exc)
            current_price = None

        if current_price is None:
            _update_item_state(item, current_price, target_hit=False)
            continue

        target_hit = current_price <= item.target_price
        _update_item_state(item, current_price, target_hit=target_hit)

        if target_hit:
            _send_notification(item, current_price)
            notifications_sent += 1

    LOGGER.info("Finished price scan. Notifications sent: %s", notifications_sent)
    return {"status": "ok", "notifications_sent": notifications_sent}


def _load_active_items() -> List[Item]:
    scan_kwargs = {
        "FilterExpression": Attr("status").eq("ACTIVE"),
    }
    items: List[Item] = []
    while True:
        response = table.scan(**scan_kwargs)
        for raw in response.get("Items", []):
            try:
                items.append(
                    Item(
                        user_id=raw["user_id"],
                        item_id=raw["item_id"],
                        url=raw["url"],
                        target_price=Decimal(str(raw.get("target_price", "0"))),
                        notification_channel=raw.get("notification_channel", "email"),
                        product_name=raw.get("product_name"),
                        last_price=Decimal(str(raw.get("last_price"))) if raw.get("last_price") is not None else None,
                        last_checked=raw.get("last_checked"),
                        status=raw.get("status", "ACTIVE"),
                    )
                )
            except KeyError:
                LOGGER.warning("Skipping malformed item: %s", raw)
        if "LastEvaluatedKey" not in response:
            break
        scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return items


def _fetch_price(url: str) -> Optional[Decimal]:
    headers = {"User-Agent": random.choice(USER_AGENT_CHOICES)}
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    price_candidates = []
    for meta in soup.select("meta[property='product:price:amount']"):
        content = meta.get("content")
        if content:
            price_candidates.append(content)

    if not price_candidates:
        text = soup.get_text(" ")
        for pattern in PRICE_PATTERNS:
            match = pattern.search(text)
            if match:
                price_candidates.append(match.group(1))
                break

    if not price_candidates:
        return None

    numeric = price_candidates[0].replace(",", "")
    try:
        return Decimal(numeric)
    except Exception:  # noqa: BLE001 - fallback if parsing fails
        LOGGER.warning("Could not parse price value '%s'", price_candidates[0])
        return None


def _update_item_state(item: Item, current_price: Optional[Decimal], target_hit: bool = False) -> None:
    update_expression = ["last_checked = :now"]
    values: Dict[str, Any] = {":now": datetime.now(timezone.utc).isoformat()}

    if current_price is not None:
        update_expression.append("last_price = :price")
        values[":price"] = Decimal(str(current_price))

    if target_hit:
        update_expression.append("#st = :status")
        values[":status"] = "TARGET_HIT"

    expression_names = {"#st": "status"} if target_hit else None

    update_kwargs: Dict[str, Any] = {
        "Key": {"user_id": item.user_id, "item_id": item.item_id},
        "UpdateExpression": "SET " + ", ".join(update_expression),
        "ExpressionAttributeValues": values,
    }
    if expression_names:
        update_kwargs["ExpressionAttributeNames"] = expression_names

    table.update_item(**update_kwargs)


def _send_notification(item: Item, current_price: Decimal) -> None:
    message = {
        "user_id": item.user_id,
        "item_id": item.item_id,
        "url": item.url,
        "product_name": item.product_name,
        "target_price": str(item.target_price),
        "current_price": str(current_price),
        "notification_channel": item.notification_channel,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }

    sns_client.publish(TopicArn=SNS_TOPIC, Message=json.dumps(message))
    table.update_item(
        Key={"user_id": item.user_id, "item_id": item.item_id},
        UpdateExpression="SET last_notified_at = :sent",
        ExpressionAttributeValues={":sent": message["sent_at"]},
    )
    LOGGER.info("Notification queued for %s", item.item_id)
