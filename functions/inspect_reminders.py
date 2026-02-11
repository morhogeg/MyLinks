
import os
import sys
import json
from datetime import datetime
from firebase_admin import initialize_app, firestore

# Add functions directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def check_reminders():
    try:
        initialize_app()
    except ValueError:
        pass
    
    db = firestore.client()
    
    # Check for the main test user
    test_phone = "+16462440305"
    print(f"Checking for user with phone: {test_phone}")
    
    # Try both field names since it might have reverted or not updated
    users = db.collection('users').where('phone_number', '==', test_phone).get()
    if not users:
        users = db.collection('users').where('phoneNumber', '==', test_phone).get()
        
    if not users:
        print("No user found with that phone number.")
        # Let's list the first few users to be sure
        print("Listing first 5 users:")
        all_users = db.collection('users').limit(5).get()
        for u in all_users:
            data = u.to_dict()
            print(f"UID: {u.id}, Phone: {data.get('phone_number') or data.get('phoneNumber')}")
        return

    user = users[0]
    uid = user.id
    user_data = user.to_dict()
    print(f"Found user: {uid}")
    print(f"Settings: {json.dumps(user_data.get('settings', {}), indent=2)}")
    
    # Check all links to see their status
    links_ref = db.collection('users').document(uid).collection('links')
    all_links = links_ref.get()
    
    print(f"\nTotal links: {len(all_links)}")
    now_ms = int(datetime.now().timestamp() * 1000)
    print(f"Current time (ms): {now_ms}")
    
    for link in all_links:
        data = link.to_dict()
        reminder_status = data.get('reminderStatus')
        next_at = data.get('nextReminderAt')
        
        if reminder_status or next_at:
            print(f"Link ID: {link.id}")
            print(f"  Title: {data.get('title')}")
            print(f"  reminderStatus: {reminder_status}")
            print(f"  nextReminderAt: {next_at}")
            if isinstance(next_at, int):
                due_diff = (next_at - now_ms) / 1000 / 60
                print(f"  Due in: {due_diff:.2f} minutes")
            print("-" * 20)

if __name__ == "__main__":
    check_reminders()
