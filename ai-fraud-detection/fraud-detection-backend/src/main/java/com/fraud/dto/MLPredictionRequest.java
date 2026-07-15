package com.fraud.dto;

public class MLPredictionRequest {
    private double amount;
    private double hour;
    private int    loginAttempts;
    private int    accountAge;
    private int    isNewDevice;
    private int    isNight;
    private String transactionType;
    private String location;

    public MLPredictionRequest() {}

    public double getAmount() { return amount; }
    public void setAmount(double amount) { this.amount = amount; }

    public double getHour() { return hour; }
    public void setHour(double hour) { this.hour = hour; }

    public int getLoginAttempts() { return loginAttempts; }
    public void setLoginAttempts(int loginAttempts) { this.loginAttempts = loginAttempts; }

    public int getAccountAge() { return accountAge; }
    public void setAccountAge(int accountAge) { this.accountAge = accountAge; }

    public int getIsNewDevice() { return isNewDevice; }
    public void setIsNewDevice(int isNewDevice) { this.isNewDevice = isNewDevice; }

    public int getIsNight() { return isNight; }
    public void setIsNight(int isNight) { this.isNight = isNight; }

    public String getTransactionType() { return transactionType; }
    public void setTransactionType(String transactionType) { this.transactionType = transactionType; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
}
