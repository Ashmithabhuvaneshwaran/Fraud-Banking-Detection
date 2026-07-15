package com.fraud.service;

import com.fraud.dto.MLPredictionRequest;
import com.fraud.dto.MLPredictionResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MLService {

    @Value("${ml.service.url}")
    private String mlServiceUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    // Simple in-memory cache: transactionId -> prediction
    private final ConcurrentHashMap<String, MLPredictionResponse> cache = new ConcurrentHashMap<>();

    /**
     * Call the Python Flask /predict endpoint.
     * Falls back to rule-based prediction if ML service is unavailable.
     */
    public MLPredictionResponse predict(MLPredictionRequest request) {
        try {
            String url = mlServiceUrl + "/predict";
            MLPredictionResponse response = restTemplate.postForObject(url, request, MLPredictionResponse.class);
            return response != null ? response : fallbackPrediction(request);
        } catch (Exception e) {
            // ML service unavailable — use rule-based fallback
            System.out.println("[ML] Flask service unavailable, using rule-based fallback: " + e.getMessage());
            return fallbackPrediction(request);
        }
    }

    /**
     * Rule-based fallback when ML service is down.
     * Scores 0-100 based on simple heuristics.
     */
    @SuppressWarnings("unchecked")
    public MLPredictionResponse fallbackPrediction(MLPredictionRequest request) {
        int score = 0;

        if (request.getAmount() > 50000)      score += 25;
        else if (request.getAmount() > 10000) score += 15;

        if (request.getIsNight() == 1)          score += 20;
        if (request.getLoginAttempts() >= 3)    score += 20;
        if (request.getAccountAge() < 3)        score += 20;
        if (request.getIsNewDevice() == 1)      score += 15;

        double prob = score / 100.0;
        String confidence = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";

        MLPredictionResponse resp = new MLPredictionResponse();
        resp.setFraudProbability(prob);
        resp.setFraudScore(score);
        resp.setIsFraud(score >= 40);
        resp.setConfidence(confidence);
        resp.setExplanation(Map.of(
            "topReasons", java.util.List.of(
                Map.of("feature", "amount",        "impact", 0.25, "description", "High Transaction Amount"),
                Map.of("feature", "isNight",       "impact", 0.20, "description", "Night Transaction"),
                Map.of("feature", "loginAttempts", "impact", 0.20, "description", "Multiple Login Attempts")
            ),
            "anomalyScore", -0.10,
            "isAnomaly",    score >= 40,
            "confidence",   confidence,
            "source",       "RULE_BASED_FALLBACK"
        ));
        return resp;
    }

    /**
     * Fetch model performance metrics from Flask.
     */
    public Map<?, ?> getModelStats() {
        try {
            return restTemplate.getForObject(mlServiceUrl + "/model/stats", Map.class);
        } catch (Exception e) {
            return Map.of("error", "ML service unavailable", "message", e.getMessage());
        }
    }

    /**
     * Fetch feature importance from Flask.
     */
    public Object getModelFeatures() {
        try {
            return restTemplate.getForObject(mlServiceUrl + "/model/features", Object.class);
        } catch (Exception e) {
            return Map.of("error", "ML service unavailable");
        }
    }

    /**
     * Trigger background model retraining on Flask.
     */
    public Map<?, ?> triggerRetrain(Object payload) {
        try {
            return restTemplate.postForObject(mlServiceUrl + "/retrain", payload, Map.class);
        } catch (Exception e) {
            return Map.of("error", "ML service unavailable", "message", e.getMessage());
        }
    }
}
