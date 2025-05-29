#!/bin/bash

# Config variables
#put your token here
BEARER_TOKEN=""
ID=""  # Replace with your actual ID
IMAGE_NAME="" # Replace with an image name on the server side
BASE_URL="" # Replace with the base URL of your firebase projet

# Construct URL
FULL_URL="$BASE_URL/getImageUrl?name=$IMAGE_NAME&id=$ID"

# Download image and run visualizer
curl -H "Authorization: Bearer $BEARER_TOKEN" "$FULL_URL" --output ./image.bin && python3 ./visualizer.py
