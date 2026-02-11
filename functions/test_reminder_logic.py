from datetime import datetime, timedelta

def calculate_next_reminder(reminder_count: int, profile: str = "smart") -> datetime:
    """
    Calculate the next reminder date using spaced repetition
    
    Profiles:
    - smart: 1, 7, 30, 90 days
    - spaced: initial (3), 5, 7 days
    - spaced-N: initial N, then progression
    """
    
    # helper for spaced repetition logic
    def get_spaced_interval(start_days: int, count: int) -> int:
        if start_days == 3:
            if count == 1: return 5
            if count == 2: return 7
        elif start_days == 5:
            if count == 1: return 7
            if count == 2: return 14
        elif start_days == 7:
            if count == 1: return 14
            if count == 2: return 30
            
        return 90 # default long term
        
    if profile.startswith("spaced"):
        start_days = 3
        # Extract initial days if present
        if "-" in profile:
            try:
                start_days = int(profile.split("-")[1])
            except:
                pass
        
        # If calling for the *first* automatic scheduling (after user set first one), count is 1.
        if reminder_count == 0:
            days = start_days
        else:
            days = get_spaced_interval(start_days, reminder_count)
            
        return datetime.now() + timedelta(days=days)

    else: # smart
        intervals = {
            1: timedelta(days=7),
            2: timedelta(days=30),
        }
        interval = intervals.get(reminder_count, timedelta(days=90))
        return datetime.now() + interval

def test_spaced():
    print("Testing 'spaced' profile (3-5-7 days requirement):")
    now = datetime.now()
    
    # After 1st reminder sent (at T+3)
    next_rem = calculate_next_reminder(1, profile="spaced")
    diff = (next_rem - now).days
    print(f"Step 1: After 1st reminder (init 3), next interval: {diff} days (Expect 5)")
    assert diff == 5
    
    # After 2nd reminder sent (at T+3+5)
    next_rem = calculate_next_reminder(2, profile="spaced")
    diff = (next_rem - now).days
    print(f"Step 2: After 2nd reminder (init 3), next interval: {diff} days (Expect 7)")
    assert diff == 7
    
    # After 3rd reminder sent (at T+3+5+7)
    next_rem = calculate_next_reminder(3, profile="spaced")
    diff = (next_rem - now).days
    print(f"Step 3: After 3rd reminder (init 3), next interval: {diff} days (Expect 90)")
    assert diff == 90
    print("Standard Spaced tests passed!\n")

def test_spaced_5():
    print("Testing 'spaced-5' profile (5-7-14 days?):")
    now = datetime.now()
    
    # After 1st reminder sent (at T+5)
    next_rem = calculate_next_reminder(1, profile="spaced-5")
    diff = (next_rem - now).days
    print(f"Step 1: After 1st reminder (init 5), next interval: {diff} days (Expect 7)")
    assert diff == 7
    
    # After 2nd reminder sent (at T+5+7)
    next_rem = calculate_next_reminder(2, profile="spaced-5")
    diff = (next_rem - now).days
    print(f"Step 2: After 2nd reminder (init 5), next interval: {diff} days (Expect 14)")
    assert diff == 14

    print("Spaced-5 tests passed!\n")

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
    test_spaced_5()
    test_smart()
