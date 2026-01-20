# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from __future__ import annotations

import logging
from typing import Any, TYPE_CHECKING

import requests
from flask import g, Response, request
from flask_appbuilder import expose
from flask_appbuilder.api import rison
from flask_appbuilder.security.decorators import has_access_api
from flask_babel import lazy_gettext as _

from superset import conf, db, event_logger
from superset.commands.chart.exceptions import (
    TimeRangeAmbiguousError,
    TimeRangeParseFailError,
)
from superset.legacy import update_time_range
from superset.models.slice import Slice
from superset.superset_typing import FlaskResponse
from superset.utils import json
from superset.utils.date_parser import get_since_until
from superset.views.base import api, BaseSupersetView
from superset.views.error_handling import handle_api_exception

if TYPE_CHECKING:
    from superset.common.query_context_factory import QueryContextFactory

get_time_range_schema = {
    "type": ["string", "array"],
    "items": {
        "type": "object",
        "properties": {
            "timeRange": {"type": "string"},
            "shift": {"type": "string"},
        },
    },
}


class Api(BaseSupersetView):
    route_base = "/api"
    query_context_factory = None

    @event_logger.log_this
    @api
    @handle_api_exception
    @has_access_api
    @expose("/v1/query/", methods=("POST",))
    def query(self) -> FlaskResponse:
        """
        Take a query_obj constructed in the client and returns payload data response
        for the given query_obj.

        raises SupersetSecurityException: If the user cannot access the resource
        """
        query_context = self.get_query_context_factory().create(
            **json.loads(request.form["query_context"])
        )
        query_context.raise_for_access()
        result = query_context.get_payload()
        payload_json = result["queries"]
        return json.dumps(payload_json, default=json.json_int_dttm_ser, ignore_nan=True)

    @event_logger.log_this
    @api
    @handle_api_exception
    @has_access_api
    @expose("/v1/form_data/", methods=("GET",))
    def query_form_data(self) -> FlaskResponse:
        """
        Get the form_data stored in the database for existing slice.
        params: slice_id: integer
        """
        form_data = {}
        if slice_id := request.args.get("slice_id"):
            slc = db.session.query(Slice).filter_by(id=slice_id).one_or_none()
            if slc:
                form_data = slc.form_data.copy()

        update_time_range(form_data)

        return self.json_response(form_data)

    @api
    @handle_api_exception
    @has_access_api
    @rison(get_time_range_schema)
    @expose("/v1/time_range/", methods=("GET",))
    def time_range(self, **kwargs: Any) -> FlaskResponse:
        """Get actually time range from human-readable string or datetime expression."""
        time_ranges = kwargs["rison"]
        try:
            if isinstance(time_ranges, str):
                time_ranges = [{"timeRange": time_ranges}]

            rv = []
            for time_range in time_ranges:
                since, until = get_since_until(
                    time_range=time_range["timeRange"],
                    time_shift=time_range.get("shift"),
                )
                rv.append(
                    {
                        "since": since.isoformat() if since else "",
                        "until": until.isoformat() if until else "",
                        "timeRange": time_range["timeRange"],
                        "shift": time_range.get("shift"),
                    }
                )
            return self.json_response({"result": rv})
        except (ValueError, TimeRangeParseFailError, TimeRangeAmbiguousError) as error:
            error_msg = {"message": _("Unexpected time range: %(error)s", error=error)}
            return self.json_response(error_msg, 400)

    @event_logger.log_this
    @api
    @handle_api_exception
    @expose("/v1/chat/anthropic", methods=("POST",))
    def chat_anthropic(self) -> FlaskResponse:
        """
        Proxy endpoint for Anthropic Claude API chat requests.
        This endpoint handles CORS and keeps the API key server-side.
        """
        try:
            # Check if user is authenticated
            if g.user is None or g.user.is_anonymous:
                return self.json_response(
                    {"error": {"message": "Authentication required"}},
                    401,
                )

            # Get API key from config
            api_key = conf.get("CLAUDE_API_KEY")
            if not api_key:
                return self.json_response(
                    {"error": {"message": "CLAUDE_API_KEY not configured in superset_config.py"}},
                    400,
                )

            # Get request data
            request_data = request.get_json()
            if not request_data:
                return self.json_response(
                    {"error": {"message": "Request body is required"}},
                    400,
                )

            # Prepare Anthropic API request
            anthropic_url = "https://api.anthropic.com/v1/messages"
            anthropic_payload = {
                "model": request_data.get("model", "claude-sonnet-4-5-20250929"),
                "system": request_data.get("system", ""),
                "messages": request_data.get("messages", []),
                "max_tokens": request_data.get("max_tokens", 1024),
            }

            # Make request to Anthropic API
            headers = {
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            }

            logger = logging.getLogger(__name__)
            logger.info(f"Calling Anthropic API with model: {anthropic_payload['model']}")

            response = requests.post(
                anthropic_url,
                json=anthropic_payload,
                headers=headers,
                timeout=60,
            )

            # Log response details for debugging
            logger.info(f"Anthropic API response status: {response.status_code}")
            if response.status_code != 200:
                logger.error(f"Anthropic API error response: {response.text}")

            # Return response from Anthropic
            response.raise_for_status()
            return Response(
                response.content,
                status=response.status_code,
                mimetype="application/json",
            )
        except requests.exceptions.RequestException as e:
            logger = logging.getLogger(__name__)
            logger.exception("Error calling Anthropic API")
            error_msg = str(e)
            if hasattr(e, "response") and e.response is not None:
                try:
                    error_data = e.response.json()
                    error_msg = error_data.get("error", {}).get("message", error_msg)
                except Exception:
                    error_msg = e.response.text or error_msg
            return self.json_response(
                {"error": {"message": f"Anthropic API error: {error_msg}"}},
                500,
            )
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.exception("Unexpected error in chat_anthropic")
            return self.json_response(
                {"error": {"message": f"Unexpected error: {str(e)}"}},
                500,
            )

    def get_query_context_factory(self) -> QueryContextFactory:
        if self.query_context_factory is None:
            # pylint: disable=import-outside-toplevel
            from superset.common.query_context_factory import QueryContextFactory

            self.query_context_factory = QueryContextFactory()
        return self.query_context_factory
