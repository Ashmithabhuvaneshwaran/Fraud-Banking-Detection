package com.fraud.controller;

import com.fraud.model.Transaction;
import com.fraud.dto.TransactionRequest;
import com.fraud.service.TransactionService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class TransactionController {

    @Autowired
    private TransactionService transactionService;

    // ── All Transactions ──────────────────────────────────────────────────────

    @GetMapping("/transactions")
    public ResponseEntity<List<Transaction>> getAll() {
        return ResponseEntity.ok(transactionService.getAll());
    }

    @PostMapping("/transactions")
    public ResponseEntity<Transaction> create(@Valid @RequestBody TransactionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(transactionService.create(request));
    }

    @GetMapping("/transactions/{transactionId}")
    public ResponseEntity<Transaction> getById(@PathVariable String transactionId) {
        return ResponseEntity.ok(transactionService.getById(transactionId));
    }

    @DeleteMapping("/transactions/{transactionId}")
    public ResponseEntity<Void> delete(@PathVariable String transactionId) {
        transactionService.delete(transactionId);
        return ResponseEntity.noContent().build();
    }

    // ── Fraud / Safe Filters ──────────────────────────────────────────────────

    @GetMapping("/fraud")
    public ResponseEntity<List<Transaction>> getFraud() {
        return ResponseEntity.ok(transactionService.getFraudulent());
    }

    @GetMapping("/safe")
    public ResponseEntity<List<Transaction>> getSafe() {
        return ResponseEntity.ok(transactionService.getSafe());
    }
}
