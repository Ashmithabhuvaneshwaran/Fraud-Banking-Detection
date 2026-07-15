package com.fraud.config;

import com.fraud.model.User;
import com.fraud.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements CommandLineRunner {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        // Seed default admin user
        if (!userRepository.existsByUsername("admin")) {
            User admin = new User(
                "admin",
                passwordEncoder.encode("admin123"),
                "ADMIN",
                "admin@frauddetect.com"
            );
            userRepository.save(admin);
            System.out.println("[Init] Default admin user created (admin/admin123)");
        }

        // Seed default regular user
        if (!userRepository.existsByUsername("user")) {
            User user = new User(
                "user",
                passwordEncoder.encode("user123"),
                "USER",
                "user@frauddetect.com"
            );
            userRepository.save(user);
            System.out.println("[Init] Default user created (user/user123)");
        }
    }
}
