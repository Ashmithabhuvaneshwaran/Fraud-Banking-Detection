package com.fraud.service;

import com.fraud.dto.TransactionRequest;
import com.fraud.exception.DuplicateTransactionException;
import com.fraud.exception.TransactionNotFoundException;
import com.fraud.model.Transaction;
import com.fraud.repository.TransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

@Service
public class TransactionService {

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private FraudDetectionService fraudDetectionService;

    // ── CRUD Operations ───────────────────────────────────────────────────────

    public Transaction create(TransactionRequest request) {
        if (transactionRepository.existsByTransactionId(request.getTransactionId())) {
            throw new DuplicateTransactionException(request.getTransactionId());
        }

        // Run fraud detection
        Map<String, Object> fraudResult = fraudDetectionService.analyze(request);

        // Build and persist Transaction
        Transaction txn = new Transaction();
        txn.setTransactionId(request.getTransactionId());
        
        if (!isAdmin()) {
            txn.setSender(getCurrentUsername());
        } else {
            txn.setSender(request.getSender());
        }
        
        txn.setReceiver(request.getReceiver());
        txn.setAmount(request.getAmount());
        txn.setLocation(request.getLocation());
        txn.setDevice(request.getDevice());
        txn.setTransactionType(request.getTransactionType());
        txn.setLoginAttempts(request.getLoginAttempts());
        txn.setAccountAge(request.getAccountAge());
        txn.setIpAddress(request.getIpAddress());
        txn.setTime(LocalDateTime.now());

        txn.setFraud((Boolean) fraudResult.get("isFraud"));
        txn.setFraudScore((Integer) fraudResult.get("fraudScore"));
        txn.setFraudProbability((Double) fraudResult.get("fraudProbability"));
        txn.setConfidence((String) fraudResult.get("confidence"));
        txn.setDetectionMethod((String) fraudResult.get("detectionMethod"));

        @SuppressWarnings("unchecked")
        List<String> reasons = (List<String>) fraudResult.get("fraudReasons");
        txn.setFraudReasons(reasons);

        @SuppressWarnings("unchecked")
        Map<String, Object> explanation = (Map<String, Object>) fraudResult.get("mlExplanation");
        txn.setMlExplanation(explanation);

        return transactionRepository.save(txn);
    }

    private String getCurrentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && !auth.getPrincipal().equals("anonymousUser")) {
            return auth.getName();
        }
        return null;
    }

    private boolean isAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null) {
            return auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
        }
        return false;
    }

    public List<Transaction> getAll() {
        if (isAdmin()) {
            return transactionRepository.findAllByOrderByCreatedAtDesc();
        } else {
            return transactionRepository.findBySenderOrderByCreatedAtDesc(getCurrentUsername());
        }
    }

    public Transaction getById(String transactionId) {
        Transaction txn = transactionRepository.findByTransactionId(transactionId)
                .orElseThrow(() -> new TransactionNotFoundException(transactionId));
        if (!isAdmin() && !txn.getSender().equals(getCurrentUsername())) {
            throw new RuntimeException("Access Denied: You can only view your own transactions");
        }
        return txn;
    }

    public void delete(String transactionId) {
        Transaction txn = getById(transactionId);
        if (!isAdmin()) {
            throw new RuntimeException("Access Denied: Only admins can delete transactions");
        }
        transactionRepository.delete(txn);
    }

    public List<Transaction> getFraudulent() {
        if (isAdmin()) {
            return transactionRepository.findByFraudTrue();
        } else {
            return transactionRepository.findBySenderAndFraudTrue(getCurrentUsername());
        }
    }

    public List<Transaction> getSafe() {
        if (isAdmin()) {
            return transactionRepository.findByFraudFalse();
        } else {
            return transactionRepository.findBySenderAndFraudFalse(getCurrentUsername());
        }
    }

    // ── Dashboard Statistics ──────────────────────────────────────────────────

    public Map<String, Object> getStatistics() {
        long total;
        long fraudCount;
        long safeCount;
        List<Transaction> recentFraud;
        double totalAmount;
        double fraudAmount;

        if (isAdmin()) {
            total = transactionRepository.count();
            fraudCount = transactionRepository.countByFraudTrue();
            safeCount = transactionRepository.countByFraudFalse();
            
            recentFraud = transactionRepository.findByFraudTrue().stream()
                    .sorted(Comparator.comparing(Transaction::getCreatedAt).reversed())
                    .limit(5)
                    .toList();
            
            totalAmount = transactionRepository.findAll().stream()
                    .mapToDouble(Transaction::getAmount)
                    .sum();
            
            fraudAmount = transactionRepository.findByFraudTrue().stream()
                    .mapToDouble(Transaction::getAmount)
                    .sum();
        } else {
            String username = getCurrentUsername();
            total = transactionRepository.countBySender(username);
            fraudCount = transactionRepository.countBySenderAndFraudTrue(username);
            safeCount = transactionRepository.countBySenderAndFraudFalse(username);
            
            recentFraud = transactionRepository.findBySenderAndFraudTrue(username).stream()
                    .sorted(Comparator.comparing(Transaction::getCreatedAt).reversed())
                    .limit(5)
                    .toList();
            
            totalAmount = transactionRepository.findBySenderOrderByCreatedAtDesc(username).stream()
                    .mapToDouble(Transaction::getAmount)
                    .sum();
            
            fraudAmount = transactionRepository.findBySenderAndFraudTrue(username).stream()
                    .mapToDouble(Transaction::getAmount)
                    .sum();
        }

        double fraudPct = total > 0 ? (fraudCount * 100.0 / total) : 0.0;

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalTransactions", total);
        stats.put("fraudTransactions",  fraudCount);
        stats.put("safeTransactions",   safeCount);
        stats.put("fraudPercentage",    Math.round(fraudPct * 100.0) / 100.0);
        stats.put("totalAmount",        Math.round(totalAmount * 100.0) / 100.0);
        stats.put("fraudAmount",        Math.round(fraudAmount * 100.0) / 100.0);
        stats.put("recentFraud",        recentFraud);
        return stats;
    }

    public Map<String, Object> getDashboard() {
        Map<String, Object> dashboard = getStatistics();

        // Daily transaction counts (last 7 days)
        LocalDateTime weekAgo = LocalDateTime.now().minusDays(7);
        List<Transaction> weekTransactions;
        
        if (isAdmin()) {
            weekTransactions = transactionRepository.findByCreatedAtBetween(weekAgo, LocalDateTime.now());
            dashboard.put("recentTransactions", transactionRepository.findTop10ByOrderByCreatedAtDesc());
        } else {
            String username = getCurrentUsername();
            weekTransactions = transactionRepository.findBySenderAndCreatedAtBetween(username, weekAgo, LocalDateTime.now());
            dashboard.put("recentTransactions", transactionRepository.findTop10BySenderOrderByCreatedAtDesc(username));
        }

        Map<String, Long> dailyCounts = new LinkedHashMap<>();
        for (int i = 6; i >= 0; i--) {
            LocalDateTime day = LocalDateTime.now().minusDays(i);
            String label = day.toLocalDate().toString();
            long count = weekTransactions.stream()
                    .filter(t -> t.getCreatedAt().toLocalDate().equals(day.toLocalDate()))
                    .count();
            dailyCounts.put(label, count);
        }
        dashboard.put("dailyCounts", dailyCounts);

        return dashboard;
    }
}
