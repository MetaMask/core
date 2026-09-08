#!/bin/bash
# Overwrite the generated release spec so only kyc-controller is published.
cat > "$1" << 'EOF'
packages:
  "@metamask/kyc-controller": "0.1.0"
EOF
