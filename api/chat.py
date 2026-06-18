from http.server import BaseHTTPRequestHandler

from api._openrouter import call_openrouter, read_json_body, send_json


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        status, payload = call_openrouter(read_json_body(self))
        send_json(self, status, payload)

    def do_GET(self):
        send_json(self, 405, {"error": "Use POST for /api/chat."})
