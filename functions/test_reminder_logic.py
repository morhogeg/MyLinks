from datetime import datetime, timedelta

def calculate_next_reminder(reminder_count: int, profile: str = "smart") -> datetime:
    """
    Calculate the next reminder date using spaced repetition
    
    Profiles:
    - smart: 1, 7, 30, 90 days
    - spaced: initial (3), 5, 7 days
    """
    if profile == "spaced":
        intervals = {
            1: timedelta(days=5),
            2: timedelta(days=7),
        }
    else: # smart
        intervals = {
            1: timedelta(days=7),
            2: timedelta(days=30),
        }
    
    interval = intervals.get(reminder_count, timedelta(days=90))
    return datetime.now() + interval

def test_spaced():
    print("Testing 'spaced' profile (3-5-7 days requirement):")
    # T+0: User sets reminder (frontend sets T+3 days, reminder_count=0)
    print("Step 0: User sets reminder. Frontend sets first reminder at T+3 days, count=0.")
    
    now = datetime.now()
    
    # After 1st reminder sent (at T+3)
    next_rem = calculate_next_reminder(1, profile="spaced")
    diff = (next_rem - now).days
    print(f"Step 1: After 1st reminder, next interval (calculate_next_reminder(1)): {diff} days (Expect 5)")
    assert diff == 5
    
    # After 2nd reminder sent (at T+3+5)
    next_rem = calculate_next_reminder(2, profile="spaced")
    diff = (next_rem - now).days
    print(f"Step 2: After 2nd reminder, next interval (calculate_next_reminder(2)): {diff} days (Expect 7)")
    assert diff == 7
    
    # After 3rd reminder sent (at T+3+5+7)
    next_rem = calculate_next_reminder(3, profile="spaced")
    diff = (next_rem - now).days
    print(f"Step 3: After 3rd reminder, next interval (calculate_next_reminder(3)): {diff} days (Expect 90 - default)")
    assert diff == 90
    print("Spaced tests passed!\n")

def test_smart():
    print("Testing 'smart' profile (1-7-30 days):")
    now = datetime.now()
    
    next_rem = calculate_next_reminder(1, profile="smart")
    diff = (next_rem - now).days
    print(f"Step 1: After 1st reminder, next interval: {diff} days (Expect 7)")
    assert diff == 7
    
    next_rem = calculate_next_reminder(2, profile="smart")
    diff = (next_rem - now).days
    print(f"Step 2: After 2nd reminder, next interval: {diff} days (Expect 30)")
    assert diff == 30
    print("Smart tests passed!")

if __name__ == "__main__":
    test_spaced()
    test_smart()
