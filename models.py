from http.server import BaseHTTPRequestHandler

from api._openrouter import fetch_free_models, send_json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send_json(self, 200, {"models": fetch_free_models()})
