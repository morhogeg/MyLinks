from flask import Flask, request as flask_request
import sys
import os

# Add the current directory to path so we can import main
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from main import whatsapp_webhook

app = Flask(__name__)

@app.route("/webhook/whatsapp", methods=["POST"])
def local_webhook():
    return whatsapp_webhook(flask_request)

if __name__ == "__main__":
    print("Starting local dev server on http://localhost:5001")
    app.run(port=5001, debug=True)
