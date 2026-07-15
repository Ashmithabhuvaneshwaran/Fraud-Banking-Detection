package com.fraud.repository;

import com.fraud.model.Transaction;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface TransactionRepository extends MongoRepository<Transaction, String> {
    List<Transaction> findByFraudTrue();
    List<Transaction> findByFraudFalse();
    Optional<Transaction> findByTransactionId(String transactionId);
    boolean existsByTransactionId(String transactionId);
    List<Transaction> findByCreatedAtBetween(LocalDateTime start, LocalDateTime end);
    long countByFraudTrue();
    long countByFraudFalse();
    List<Transaction> findAllByOrderByCreatedAtDesc();
    List<Transaction> findTop10ByOrderByCreatedAtDesc();

    List<Transaction> findBySenderAndFraudTrue(String sender);
    List<Transaction> findBySenderAndFraudFalse(String sender);
    List<Transaction> findBySenderAndCreatedAtBetween(String sender, LocalDateTime start, LocalDateTime end);
    long countBySender(String sender);
    long countBySenderAndFraudTrue(String sender);
    long countBySenderAndFraudFalse(String sender);
    List<Transaction> findBySenderOrderByCreatedAtDesc(String sender);
    List<Transaction> findTop10BySenderOrderByCreatedAtDesc(String sender);
}
