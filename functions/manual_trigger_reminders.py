
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import MagicMock

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Mock firebase_functions to avoid runtime errors during import
sys.modules['firebase_functions'] = MagicMock()
sys.modules['firebase_functions.https_fn'] = MagicMock()
sys.modules['firebase_functions.scheduler_fn'] = MagicMock()
sys.modules['firebase_functions.firestore_fn'] = MagicMock()

# Now import main
import main

# Override sending function to avoid actual costs/spam and just print
def mock_send_whatsapp(to, body):
    print(f"!!! MOCK SEND WHATSAPP !!!\nTo: {to}\nBody: {body}\n")

main.send_whatsapp_message = mock_send_whatsapp

def run_check():
    print("Running check_reminders...")
    # Create a mock event
    event = MagicMock()
    
    # Run the function
    try:
        main.check_reminders(event)
        print("check_reminders completed successfully.")
    except Exception as e:
        print(f"Error running check_reminders: {e}")

if __name__ == "__main__":
    # Ensure we have credentials or mock them if needed for local test
    # Assuming local environment has credentials or we are using a dev project
    run_check()
