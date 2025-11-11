import base64
import json
import logging
import os
from typing import Any, Dict

import boto3

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

cognito = boto3.client("cognito-idp")
USER_POOL_ID = os.environ["USER_POOL_ID"]
CLIENT_ID = os.environ["USER_POOL_CLIENT_ID"]
AUTO_CONFIRM = os.environ.get("AUTO_CONFIRM_SIGNUP", "false").lower() == "true"


def _response(status: int, body: Dict[str, Any]) -> Dict[str, Any]:
  return {
      "statusCode": status,
      "headers": {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization,Content-Type",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      "body": json.dumps(body),
  }


def _parse_body(event: Dict[str, Any]) -> Dict[str, Any]:
  raw = event.get("body") or "{}"
  if event.get("isBase64Encoded"):
    raw = base64.b64decode(raw).decode("utf-8")  # type: ignore[name-defined]
  try:
    return json.loads(raw)
  except json.JSONDecodeError:
    return {}


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
  LOGGER.info("Auth event: %s", json.dumps(event))

  method = event.get("requestContext", {}).get("http", {}).get("method", "")
  route_key = event.get("requestContext", {}).get("routeKey") or f"{method} {event.get('rawPath', '/')}"

  if method == "OPTIONS":
    return {
        "statusCode": 204,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
    }

  body = _parse_body(event)

  if route_key == "POST /auth/signup":
    return _handle_signup(body)

  if route_key == "POST /auth/signin":
    return _handle_signin(body)

  return _response(404, {"message": "Route not found"})


def _handle_signup(body: Dict[str, Any]) -> Dict[str, Any]:
  username = (body.get("username") or "").strip()
  password = body.get("password") or ""
  email = (body.get("email") or "").strip()

  if not username or not password or not email:
    return _response(400, {"message": "username, email, and password are required"})

  try:
    cognito.sign_up(
        ClientId=CLIENT_ID,
        Username=username,
        Password=password,
        UserAttributes=[{"Name": "email", "Value": email}],
    )

    if AUTO_CONFIRM:
      cognito.admin_confirm_sign_up(UserPoolId=USER_POOL_ID, Username=username)

    return _response(200, {"message": "Sign up successful"})
  except cognito.exceptions.UsernameExistsException:
    return _response(409, {"message": "Username already exists"})
  except Exception as error:  # pylint: disable=broad-except
    LOGGER.exception("Sign up failed")
    return _response(500, {"message": str(error)})


def _handle_signin(body: Dict[str, Any]) -> Dict[str, Any]:
  username = (body.get("username") or "").strip()
  password = body.get("password") or ""

  if not username or not password:
    return _response(400, {"message": "username and password are required"})

  try:
    auth = cognito.initiate_auth(
        ClientId=CLIENT_ID,
        AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={"USERNAME": username, "PASSWORD": password},
    )

    tokens = auth.get("AuthenticationResult") or {}
    return _response(
        200,
        {
            "accessToken": tokens.get("AccessToken"),
            "idToken": tokens.get("IdToken"),
            "refreshToken": tokens.get("RefreshToken"),
            "expiresIn": tokens.get("ExpiresIn"),
            "tokenType": tokens.get("TokenType"),
        },
    )
  except cognito.exceptions.NotAuthorizedException:
    return _response(401, {"message": "Incorrect username or password"})
  except cognito.exceptions.UserNotConfirmedException:
    return _response(403, {"message": "User not confirmed"})
  except Exception as error:  # pylint: disable=broad-except
    LOGGER.exception("Sign in failed")
    return _response(500, {"message": str(error)})
