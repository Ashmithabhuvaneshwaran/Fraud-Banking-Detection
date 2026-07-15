package com.fraud.service;

import com.fraud.dto.MLPredictionRequest;
import com.fraud.dto.MLPredictionResponse;
import com.fraud.dto.TransactionRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class FraudDetectionService {

    @Autowired
    private MLService mlService;

    /**
     * Builds an ML prediction request from a transaction request.
     */
    public MLPredictionRequest buildMLRequest(TransactionRequest txn) {
        MLPredictionRequest ml = new MLPredictionRequest();
        ml.setAmount(txn.getAmount());
        ml.setHour(txn.getHour());
        ml.setLoginAttempts(txn.getLoginAttempts());
        ml.setAccountAge(txn.getAccountAge());
        ml.setIsNewDevice("New".equalsIgnoreCase(txn.getDevice()) ? 1 : 0);
        ml.setIsNight(txn.getHour() < 6 ? 1 : 0);
        ml.setTransactionType(txn.getTransactionType());
        ml.setLocation(txn.getLocation());
        return ml;
    }

    /**
     * Core fraud analysis:
     * finalScore = (ML probability × 70) + (rule score × 30)
     */
    public Map<String, Object> analyze(TransactionRequest txn) {
        MLPredictionRequest mlRequest = buildMLRequest(txn);
        MLPredictionResponse mlResult = mlService.predict(mlRequest);

        // Rule-based scoring (max 100, representing 7 rules)
        int ruleScore = computeRuleScore(txn);

        // Combined score
        double mlProb   = mlResult.getFraudProbability();
        double combined = (mlProb * 70.0) + (ruleScore * 30.0 / 100.0);
        int    finalScore = (int) Math.min(100, Math.round(combined));
        boolean isFraud   = finalScore >= 40;

        String confidence = finalScore >= 70 ? "HIGH"
                          : finalScore >= 40 ? "MEDIUM" : "LOW";

        List<String> reasons = buildReasons(txn, mlResult);

        String method = mlResult.getExplanation() != null
                        && "RULE_BASED_FALLBACK".equals(mlResult.getExplanation().get("source"))
                        ? "RULES_ONLY" : "ML+RULES";

        Map<String, Object> result = new HashMap<>();
        result.put("isFraud",          isFraud);
        result.put("fraudScore",        finalScore);
        result.put("fraudProbability",  round(mlProb, 4));
        result.put("confidence",        confidence);
        result.put("fraudReasons",      reasons);
        result.put("mlExplanation",     mlResult.getExplanation());
        result.put("detectionMethod",   method);
        return result;
    }

    // ── Rule-Based Scoring ────────────────────────────────────────────────────

    private int computeRuleScore(TransactionRequest txn) {
        int triggered = 0;
        if (txn.getAmount()        > 50000)                             triggered++;
        if (txn.getHour()          < 6)                                 triggered++;
        if (txn.getLoginAttempts() >= 3)                                triggered++;
        if (txn.getAccountAge()    < 3)                                 triggered++;
        if ("New".equalsIgnoreCase(txn.getDevice()))                    triggered++;
        if ("UPI".equalsIgnoreCase(txn.getTransactionType()) &&
            txn.getAmount() > 10000)                                    triggered++;
        if (txn.getLoginAttempts() >= 5)                                triggered++;
        // Max 7 rules → scale to 0-100
        return (int) Math.round(triggered * 100.0 / 7);
    }

    private List<String> buildReasons(TransactionRequest txn, MLPredictionResponse ml) {
        List<String> reasons = new ArrayList<>();

        if (txn.getAmount() > 50000)               reasons.add("High Transaction Amount (₹" + txn.getAmount().longValue() + ")");
        if (txn.getHour() < 6)                     reasons.add("Unusual Night Transaction (" + txn.getHour() + ":00 AM)");
        if (txn.getLoginAttempts() >= 3)            reasons.add("Multiple Login Attempts (" + txn.getLoginAttempts() + ")");
        if (txn.getAccountAge() < 3)               reasons.add("New Account (" + txn.getAccountAge() + " months old)");
        if ("New".equalsIgnoreCase(txn.getDevice()))reasons.add("New/Unrecognised Device");

        // Append ML top reasons
        if (ml.getExplanation() != null) {
            Object topReasons = ml.getExplanation().get("topReasons");
            if (topReasons instanceof List<?> list) {
                list.stream()
                    .filter(r -> r instanceof Map)
                    .map(r -> (Map<?, ?>) r)
                    .map(r -> r.get("description"))
                    .filter(Objects::nonNull)
                    .map(Object::toString)
                    .filter(d -> reasons.stream().noneMatch(r -> r.contains(d)))
                    .limit(3)
                    .forEach(reasons::add);
            }
        }
        return reasons;
    }

    private double round(double val, int places) {
        double factor = Math.pow(10, places);
        return Math.round(val * factor) / factor;
    }
}
