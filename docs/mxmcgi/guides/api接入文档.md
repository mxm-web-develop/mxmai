nano-banana-2

// Step 1: Start image generation
const generateUrl = 'https://api.atlascloud.ai/api/v1/model/generateImage';

const generateResponse = await fetch(generateUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer $ATLASCLOUD_API_KEY',
  },
  body: JSON.stringify({
      "model": "google/nano-banana-2/text-to-image", // Required. model name
      "aspect_ratio": "16:9", // The aspect ratio of the generated media
      "enable_base64_output": false, // If enabled, the output will be encoded into a BASE64 string instead of a URL
      "enable_sync_mode": false, // If set to true, the function will wait for the result to be generated and uploaded before returning the response
      "enable_web_search": false, // If enabled, the model will use web search to ground the generation with real-time information
      "enable_image_search": false, // If enabled, the model will use image search to ground the generation with real-time information
      "output_format": "png", // The format of the output image. default: "default". options: default | png | jpeg
      "prompt": "cyberpunk megacity at night, heavy rain, neon lights reflecting on wet streets, dense futuristic skyscrapers, giant holographic advertisements, flying vehicles in the sky, thick fog and atmospheric haze, moody cinematic lighting, dark dystopian atmosphere, ultra detailed, cinematic composition, 35mm film still, volumetric lighting, cyberpunk aesthetic", // Required. The positive prompt for the generation
      "resolution": "2k", // The resolution of the output image. default: "1k". options: 1k | 2k | 4k
      "media_resolution": "default", // Controls how input media is processed. options: default | low | medium | high
  }),
});

const generateJson = await generateResponse.json();
const predictionId = generateJson.data.id;

// Step 2: Poll for result
const pollUrl = `https://api.atlascloud.ai/api/v1/model/prediction/${predictionId}`;

const checkStatus = async () => {
  const response = await fetch(pollUrl, {
    headers: { Authorization: 'Bearer $ATLASCLOUD_API_KEY' },
  });
  const result = await response.json();

  if (result.data.status === 'completed') {
    console.log('Generated image:', result.data.outputs[0]);
    return result.data.outputs[0];
  } else if (result.data.status === 'failed') {
    throw new Error(result.data.error || 'Generation failed');
  } else {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return checkStatus();
  }
};

const imageUrl = await checkStatus();
Python
JavaScript
Swift
Kotlin
Java
Dart
cURL
Install
Install the required package for your language.

bash

pip install requests
Authentication
All API requests require authentication via an API key. You can get your API key from the Atlas Cloud dashboard.

bash

export ATLASCLOUD_API_KEY="your-api-key-here"
HTTP Headers
python

import os

API_KEY = os.environ.get("ATLASCLOUD_API_KEY")
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}"
}
Keep your API key secure
Never expose your API key in client-side code or public repositories. Use environment variables or a backend proxy instead.

Submit a request

import requests

url = "https://api.atlascloud.ai/api/v1/model/generateImage"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer $ATLASCLOUD_API_KEY"
}
data = {
    "model": "your-model",
    "prompt": "A beautiful landscape"
}

response = requests.post(url, headers=headers, json=data)
print(response.json())
Submit a Request
Submit an asynchronous generation request. The API returns a prediction ID that you can use to check the status and retrieve the result.

POST
/api/v1/model/generateImage
Request Body
Python
JavaScript
cURL

import requests

url = "https://api.atlascloud.ai/api/v1/model/generateImage"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer $ATLASCLOUD_API_KEY"
}

data = {
    "model": "google/nano-banana-2/text-to-image",
    "input": {
        "prompt": "A beautiful landscape with mountains and lake"
    }
}

response = requests.post(url, headers=headers, json=data)
result = response.json()

print(f"Prediction ID: {result['id']}")
print(f"Status: {result['status']}")
Response
{
  "id": "pred_abc123",
  "status": "processing",
  "model": "model-name",
  "created_at": "2025-01-01T00:00:00Z"
}
Check Status
Poll the prediction endpoint to check the current status of your request.

GET
/api/v1/model/prediction/{prediction_id}
Polling Example
Python
JavaScript
cURL

import requests
import time

prediction_id = "pred_abc123"
url = f"https://api.atlascloud.ai/api/v1/model/prediction/{prediction_id}"
headers = { "Authorization": "Bearer $ATLASCLOUD_API_KEY" }

while True:
    response = requests.get(url, headers=headers)
    result = response.json()
    status = result["data"]["status"]
    print(f"Status: {status}")

    if status in ["completed", "succeeded"]:
        output_url = result["data"]["outputs"][0]
        print(f"Output URL: {output_url}")
        break
    elif status == "failed":
        print(f"Error: {result['data'].get('error', 'Unknown')}")
        break

    time.sleep(3)
Status Values
processing
The request is still being processed.
completed
Generation is complete. Outputs are available.
succeeded
Generation succeeded. Outputs are available.
failed
Generation failed. Check the error field.
Completed Response
{
  "data": {
    "id": "pred_abc123",
    "status": "completed",
    "outputs": [
      "https://storage.atlascloud.ai/outputs/result.png"
    ],
    "metrics": {
      "predict_time": 8.3
    },
    "created_at": "2025-01-01T00:00:00Z",
    "completed_at": "2025-01-01T00:00:10Z"
  }
}
Upload Files
Upload files to Atlas Cloud storage and get a URL you can use in your API requests. Use multipart/form-data to upload.

POST
/api/v1/model/uploadMedia
Upload Example
Python
JavaScript
cURL

import requests

url = "https://api.atlascloud.ai/api/v1/model/uploadMedia"
headers = { "Authorization": "Bearer $ATLASCLOUD_API_KEY" }

with open("image.png", "rb") as f:
    files = {"file": ("image.png", f, "image/png")}
    response = requests.post(url, headers=headers, files=files)

result = response.json()
download_url = result["data"]["download_url"]
print(f"File URL: {download_url}")
Response
{
  "data": {
    "download_url": "https://storage.atlascloud.ai/uploads/abc123/image.png",
    "file_name": "image.png",
    "content_type": "image/png",
    "size": 1024000
  }
}
Input Schema

Copy as Markdown
The following parameters are accepted in the request body.

Total: 10
Required: 2
Optional: 8
model
string
required
model name
Default: "google/nano-banana-2/text-to-image"
aspect_ratio
string
The aspect ratio of the generated media.
1:1
3:2
2:3
3:4
4:3
4:5
5:4
9:16
16:9
21:9
enable_base64_output
boolean
If enabled, the output will be encoded into a BASE64 string instead of a URL. This property is only available through the API.
Default: false
enable_sync_mode
boolean
If set to true, the function will wait for the result to be generated and uploaded before returning the response. It allows you to get the result directly in the response. This property is only available through the API.
Default: false
enable_web_search
boolean
If enabled, the model will use web search to ground the generation with real-time information.
Default: false
enable_image_search
boolean
If enabled, the model will use image search to ground the generation with real-time information.
Default: false
output_format
string
The format of the output image.
Default: "default"
default
png
jpeg
prompt
string
required
The positive prompt for the generation.
resolution
string
The resolution of the output image.
Default: "1k"
1k
2k
4k
media_resolution
string
Controls how input media is processed. LOW reduces tokens per image/video, possibly losing detail but allowing longer videos in context. Supported values: HIGH, MEDIUM, LOW.
Default: "default"
default
low
medium
high
Example Request Body
json

{
  "model": "google/nano-banana-2/text-to-image",
  "enable_base64_output": false,
  "enable_sync_mode": false,
  "enable_web_search": false,
  "enable_image_search": false,
  "output_format": "default",
  "prompt": "A beautiful landscape",
  "resolution": "1k",
  "media_resolution": "default"
}
Output Schema

Copy as Markdown
The API returns a prediction response with the generated output URLs.

created_at
string
ISO timestamp of when the request was created (e.g., “2023-04-01T12:34:56.789Z”).
id
string
Unique identifier for the prediction, the ID of the prediction to get.
model
string
Model ID used for the prediction.
outputs
array
Array of URLs to the generated content (empty when status is not completed).
status
string
Status of the task: created, processing, completed, or failed.
Example Response
json

{
  "id": "pred_abc123",
  "status": "completed",
  "model": "model-name",
  "outputs": [
    "https://storage.atlascloud.ai/outputs/result.png"
  ],
  "metrics": {
    "predict_time": 8.3
  },
  "created_at": "2025-01-01T00:00:00Z",
  "completed_at": "2025-01-01T00:00:10Z"
}



Code Example
Python
JavaScript
cURL
Swift
Kotlin
Java
Dart
Markdown

// Step 1: Start image generation
const generateUrl = 'https://api.atlascloud.ai/api/v1/model/generateImage';

const generateResponse = await fetch(generateUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer $ATLASCLOUD_API_KEY',
  },
  body: JSON.stringify({
      "model": "google/nano-banana-2/edit", // Required. model name
      "aspect_ratio": "16:9", // The aspect ratio of the generated media
      "enable_base64_output": false, // If enabled, the output will be encoded into a BASE64 string instead of a URL
      "enable_sync_mode": false, // If set to true, the function will wait for the result to be generated and uploaded before returning the response
      "enable_web_search": false, // If enabled, the model will use web search to ground the generation with real-time information
      "enable_image_search": false, // If enabled, the model will use image search to ground the generation with real-time information
      "images": [
          "https://static.atlascloud.ai/media/images/3229c610f1ba91607dd2a15cab8f01d0.jpg"
      ], // Required. List of URLs of input images for editing
      "output_format": "png", // The format of the output image. default: "default". options: default | png | jpeg
      "prompt": "Integrate the figures in the image into a skiing scene in a current style.", // Required. The positive prompt for the generation
      "resolution": "2k", // The resolution of the output image. default: "1k". options: 1k | 2k | 4k
      "media_resolution": "default", // Controls how input media is processed. options: default | low | medium | high
  }),
});

const generateJson = await generateResponse.json();
const predictionId = generateJson.data.id;

// Step 2: Poll for result
const pollUrl = `https://api.atlascloud.ai/api/v1/model/prediction/${predictionId}`;

const checkStatus = async () => {
  const response = await fetch(pollUrl, {
    headers: { Authorization: 'Bearer $ATLASCLOUD_API_KEY' },
  });
  const result = await response.json();

  if (result.data.status === 'completed') {
    console.log('Generated image:', result.data.outputs[0]);
    return result.data.outputs[0];
  } else if (result.data.status === 'failed') {
    throw new Error(result.data.error || 'Generation failed');
  } else {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return checkStatus();
  }
};

const imageUrl = await checkStatus();
Python
JavaScript
Swift
Kotlin
Java
Dart
cURL
Install
Install the required package for your language.

bash

pip install requests
Authentication
All API requests require authentication via an API key. You can get your API key from the Atlas Cloud dashboard.

bash

export ATLASCLOUD_API_KEY="your-api-key-here"
HTTP Headers
python

import os

API_KEY = os.environ.get("ATLASCLOUD_API_KEY")
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}"
}
Keep your API key secure
Never expose your API key in client-side code or public repositories. Use environment variables or a backend proxy instead.

Submit a request

import requests

url = "https://api.atlascloud.ai/api/v1/model/generateImage"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer $ATLASCLOUD_API_KEY"
}
data = {
    "model": "your-model",
    "prompt": "A beautiful landscape"
}

response = requests.post(url, headers=headers, json=data)
print(response.json())
Submit a Request
Submit an asynchronous generation request. The API returns a prediction ID that you can use to check the status and retrieve the result.

POST
/api/v1/model/generateImage
Request Body
Python
JavaScript
cURL

import requests

url = "https://api.atlascloud.ai/api/v1/model/generateImage"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer $ATLASCLOUD_API_KEY"
}

data = {
    "model": "google/nano-banana-2/edit",
    "input": {
        "prompt": "A beautiful landscape with mountains and lake"
    }
}

response = requests.post(url, headers=headers, json=data)
result = response.json()

print(f"Prediction ID: {result['id']}")
print(f"Status: {result['status']}")
Response
{
  "id": "pred_abc123",
  "status": "processing",
  "model": "model-name",
  "created_at": "2025-01-01T00:00:00Z"
}
Check Status
Poll the prediction endpoint to check the current status of your request.

GET
/api/v1/model/prediction/{prediction_id}
Polling Example
Python
JavaScript
cURL

import requests
import time

prediction_id = "pred_abc123"
url = f"https://api.atlascloud.ai/api/v1/model/prediction/{prediction_id}"
headers = { "Authorization": "Bearer $ATLASCLOUD_API_KEY" }

while True:
    response = requests.get(url, headers=headers)
    result = response.json()
    status = result["data"]["status"]
    print(f"Status: {status}")

    if status in ["completed", "succeeded"]:
        output_url = result["data"]["outputs"][0]
        print(f"Output URL: {output_url}")
        break
    elif status == "failed":
        print(f"Error: {result['data'].get('error', 'Unknown')}")
        break

    time.sleep(3)
Status Values
processing
The request is still being processed.
completed
Generation is complete. Outputs are available.
succeeded
Generation succeeded. Outputs are available.
failed
Generation failed. Check the error field.
Completed Response
{
  "data": {
    "id": "pred_abc123",
    "status": "completed",
    "outputs": [
      "https://storage.atlascloud.ai/outputs/result.png"
    ],
    "metrics": {
      "predict_time": 8.3
    },
    "created_at": "2025-01-01T00:00:00Z",
    "completed_at": "2025-01-01T00:00:10Z"
  }
}
Upload Files
Upload files to Atlas Cloud storage and get a URL you can use in your API requests. Use multipart/form-data to upload.

POST
/api/v1/model/uploadMedia
Upload Example
Python
JavaScript
cURL

import requests

url = "https://api.atlascloud.ai/api/v1/model/uploadMedia"
headers = { "Authorization": "Bearer $ATLASCLOUD_API_KEY" }

with open("image.png", "rb") as f:
    files = {"file": ("image.png", f, "image/png")}
    response = requests.post(url, headers=headers, files=files)

result = response.json()
download_url = result["data"]["download_url"]
print(f"File URL: {download_url}")
Response
{
  "data": {
    "download_url": "https://storage.atlascloud.ai/uploads/abc123/image.png",
    "file_name": "image.png",
    "content_type": "image/png",
    "size": 1024000
  }
}
Input Schema

Copy as Markdown
The following parameters are accepted in the request body.

Total: 11
Required: 3
Optional: 8
model
string
required
model name
Default: "google/nano-banana-2/edit"
aspect_ratio
string
The aspect ratio of the generated media.
1:1
3:2
2:3
3:4
4:3
4:5
5:4
9:16
16:9
21:9
enable_base64_output
boolean
If enabled, the output will be encoded into a BASE64 string instead of a URL. This property is only available through the API.
Default: false
enable_sync_mode
boolean
If set to true, the function will wait for the result to be generated and uploaded before returning the response. It allows you to get the result directly in the response. This property is only available through the API.
Default: false
enable_web_search
boolean
If enabled, the model will use web search to ground the generation with real-time information.
Default: false
enable_image_search
boolean
If enabled, the model will use image search to ground the generation with real-time information.
Default: false
images
array[string]
required
List of URLs of input images for editing. The maximum number of images is 14.
Min items: 1
Max items: 14
output_format
string
The format of the output image.
Default: "default"
default
png
jpeg
prompt
string
required
The positive prompt for the generation.
resolution
string
The resolution of the output image.
Default: "1k"
1k
2k
4k
media_resolution
string
Controls how input media is processed. LOW reduces tokens per image/video, possibly losing detail but allowing longer videos in context. Supported values: HIGH, MEDIUM, LOW.
Default: "default"
default
low
medium
high
Example Request Body
json

{
  "model": "google/nano-banana-2/edit",
  "enable_base64_output": false,
  "enable_sync_mode": false,
  "enable_web_search": false,
  "enable_image_search": false,
  "images": [
    "https://example.com/file.jpg"
  ],
  "output_format": "default",
  "prompt": "A beautiful landscape",
  "resolution": "1k",
  "media_resolution": "default"
}
Output Schema

Copy as Markdown
The API returns a prediction response with the generated output URLs.

created_at
string
ISO timestamp of when the request was created (e.g., “2023-04-01T12:34:56.789Z”).
id
string
Unique identifier for the prediction, the ID of the prediction to get.
model
string
Model ID used for the prediction.
outputs
array
Array of URLs to the generated content (empty when status is not completed).
status
string
Status of the task: created, processing, completed, or failed.
Example Response
json

{
  "id": "pred_abc123",
  "status": "completed",
  "model": "model-name",
  "outputs": [
    "https://storage.atlascloud.ai/outputs/result.png"
  ],
  "metrics": {
    "predict_time": 8.3
  },
  "created_at": "2025-01-01T00:00:00Z",
  "completed_at": "2025-01-01T00:00:10Z"
}