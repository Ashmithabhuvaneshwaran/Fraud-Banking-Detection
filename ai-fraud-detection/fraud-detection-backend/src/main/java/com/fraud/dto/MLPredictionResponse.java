package com.fraud.dto;

import java.util.List;
import java.util.Map;

public class MLPredictionResponse {
    private double  fraudProbability;
    private int     fraudScore;
    private boolean isFraud;
    private String  confidence;
    private Map<String, Object> explanation;

    public MLPredictionResponse() {}

    public double getFraudProbability() { return fraudProbability; }
    public void setFraudProbability(double fraudProbability) { this.fraudProbability = fraudProbability; }

    public int getFraudScore() { return fraudScore; }
    public void setFraudScore(int fraudScore) { this.fraudScore = fraudScore; }

    public boolean isIsFraud() { return isFraud; }
    public void setIsFraud(boolean isFraud) { this.isFraud = isFraud; }

    public String getConfidence() { return confidence; }
    public void setConfidence(String confidence) { this.confidence = confidence; }

    public Map<String, Object> getExplanation() { return explanation; }
    public void setExplanation(Map<String, Object> explanation) { this.explanation = explanation; }
}
