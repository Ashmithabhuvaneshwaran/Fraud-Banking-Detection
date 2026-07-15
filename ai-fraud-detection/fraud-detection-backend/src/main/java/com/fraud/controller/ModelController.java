package com.fraud.controller;

import com.fraud.service.MLService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/model")
@CrossOrigin(origins = "*")
public class ModelController {

    @Autowired
    private MLService mlService;

    @GetMapping("/stats")
    public ResponseEntity<?> getStats() {
        return ResponseEntity.ok(mlService.getModelStats());
    }

    @GetMapping("/features")
    public ResponseEntity<?> getFeatures() {
        return ResponseEntity.ok(mlService.getModelFeatures());
    }

    @PostMapping("/retrain")
    public ResponseEntity<?> retrain(@RequestBody(required = false) Object payload) {
        return ResponseEntity.ok(mlService.triggerRetrain(payload));
    }
}
