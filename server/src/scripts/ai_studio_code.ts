// To run this code you need to install the following dependencies:
// npm install @google/genai
// npm install -D @types/node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import {
  GoogleGenAI,
  PersonGeneration
} from '@google/genai';
import { writeFile } from 'fs';

function saveBinaryFile(fileName: string, content: Buffer) {
  // TODO: go/ts59upgrade - Remove this suppression after TS 5.9.2 upgrade
  //  error TS2345: Argument of type 'Buffer' is not assignable to parameter of type 'string | ArrayBufferView'.
  // @ts-ignore
  writeFile(fileName, content, 'utf8', (err) => {
    if (err) {
      console.error(`Error writing file ${fileName}:`, err);
      return;
    }
    console.log(`File ${fileName} saved to file system.`);
  });
}

async function main() {
  const ai = new GoogleGenAI({
    apiKey: process.env['GEMINI_API_KEY'],
  });

  const response = await ai.models.generateImages({
    model: 'models/imagen-4.0-generate-001',
    prompt: `Interior kitchen photograph of a 1985 single family home in Phoenix, Arizona. Showing dated 1980s cabinets, worn countertops, and older appliances. Showing visible cracks in walls or foundation, water damage or staining visible, dated finishes or peeling paint. Property is vacant and unfurnished. Well-worn condition showing signs of deferred maintenance. Empty kitchen with no people. Photorealistic MLS real estate listing photo, natural daylight, taken with smartphone camera. Real photograph taken with smartphone camera. Actual MLS real estate listing photo. Raw unedited photo. NOT a 3D render, NOT digital art, NOT an illustration.`,
    config: {
      numberOfImages: 1,
      outputMimeType: 'image/jpeg',
      personGeneration: PersonGeneration.ALLOW_ADULT,
      aspectRatio: '1:1',
      imageSize: '1K',
    },
  });

  if (!response?.generatedImages) {
    console.error('No images generated.');
    return;
  }

  if (response.generatedImages.length !== 1) {
    console.error('Number of images generated does not match the requested number.');
  }

  for (let i = 0; i < response.generatedImages.length; i++) {
    if (!response.generatedImages?.[i]?.image?.imageBytes) {
      continue;
    }
    const fileName = `image_${i}.jpeg`;
    const inlineData = response?.generatedImages?.[i]?.image?.imageBytes;
    const buffer = Buffer.from(inlineData || '', 'base64');
    saveBinaryFile(fileName, buffer);
  }
}

main();


