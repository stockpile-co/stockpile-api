#!/bin/bash

# http://redsymbol.net/articles/unofficial-bash-strict-mode/
set -euo pipefail
IFS=$'\n\t'

# Fail fast if not running on Travis
[[ -n $TRAVIS ]] && printf "%s\n" "Must run on Travis; quitting" && exit

# Declare Travis CI environment variables
declare encrypted_f23ec77474f0_key
declare encrypted_f23ec77474f0_iv

# Disable strict host key checking for SSH
printf "%s\n" "Host adamvig.com\n\tStrictHostKeyChecking no\n" >> ~/.ssh/config

# Unencrypt deploy key
openssl aes-256-cbc -K "$encrypted_f23ec77474f0_key" \
        -iv "$encrypted_f23ec77474f0_iv" -in deploy_key.enc \
        -out ~/.ssh/id_rsa -d

# Set permissions on deploy key
chmod 600 ~/.ssh/id_rsa

# Add git remote for deployment
git remote add prod ssh://git@adamvig.com/opt/stockpile-api.git

# Deploy
git push prod master