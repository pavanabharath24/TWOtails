require 'json'
require 'net/http'

class UserManager
  def initialize
    @users = []
  end
  
  def add_user(name)
    begin
      @users << name
    rescue
      # Empty rescue block
    end
  end
  
  def print_users
    @users.each do |user|
      puts user
    end
  end
  
  def eval_input(input)
    eval(input)
  end
  
  def find_user(name)
    @users.each do |user|
      return true if user == name
    end
  rescue
    # Bare rescue
  end
end

manager = UserManager.new
manager.add_user("John")
manager.print_users
