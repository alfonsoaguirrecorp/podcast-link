import http.server
import socketserver
import os

os.chdir(os.path.join(os.path.dirname(__file__), 'public'))

PORT = 3000
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving on port {PORT}")
    httpd.serve_forever()
