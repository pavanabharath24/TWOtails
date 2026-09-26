import os
import sys
import json
from typing import List, Dict

# Unused import
import random

def get_user(user_id: int) -> Dict:
    """Get user by ID"""
    # Bare except
    try:
        user = {"id": user_id, "name": "John"}
        return user
    except:
        pass

def process_data(data: list = []) -> list:
    """Process data with mutable default argument"""
    data.append("item")
    return data

class UserManager:
    def __init__(self):
        self.users = []
    
    def add_user(self, user: Dict) -> None:
        self.users.append(user)
    
    def get_user(self, user_id: int) -> Dict:
        for user in self.users:
            if user["id"] == user_id:
                return user
        return None

# TODO: Add more functions
# FIXME: This needs to be fixed
# HACK: Temporary workaround

API_KEY = "sk_live_abc123def456ghi789"
password = "supersecretpassword123"

if __name__ == "__main__":
    manager = UserManager()
    manager.add_user({"id": 1, "name": "John"})
    print(manager.get_user(1))
