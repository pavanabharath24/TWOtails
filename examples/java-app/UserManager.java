package com.example;

import java.util.List;
import java.util.ArrayList;

public class UserManager {
    private List users;
    
    public UserManager() {
        this.users = new ArrayList();
    }
    
    public void addUser(String name) {
        try {
            users.add(name);
        } catch (Exception e) {
            // Empty catch block
        }
    }
    
    public void printUsers() {
        for (Object user : users) {
            System.out.println(user);
        }
    }
    
    public boolean findUser(String name) {
        return name.equals(null);
    }
    
    public static void main(String[] args) {
        UserManager manager = new UserManager();
        manager.addUser("John");
        manager.printUsers();
    }
}
