// Invoice Data Extraction Service
// This module provides invoice data extraction functionality
// Currently uses mock extraction, but structured for easy OpenAI integration

export interface ExtractedInvoiceData {
  supplier_name: string
  total_amount: number
}

/**
 * Mock extraction function that simulates AI extraction
 * Returns random supplier name and amount
 * 
 * TO REPLACE WITH OPENAI:
 * 1. Install: npm install openai
 * 2. Add API key to environment variables
 * 3. Replace the implementation of extractInvoiceData() below
 * 4. Use OpenAI Vision API to analyze the invoice image/PDF
 */
export async function extractInvoiceDataMock(fileUrl: string): Promise<ExtractedInvoiceData> {
  // Simulate API processing delay
  await new Promise(resolve => setTimeout(resolve, 1500))

  // Mock suppliers list
  const suppliers = [
    'Google LLC',
    'Amazon Web Services',
    'Bezeq International',
    'Microsoft Corporation',
    'Apple Inc.',
    'Meta Platforms',
    'Oracle Corporation',
    'Salesforce',
    'Adobe Systems',
    'IBM Corporation'
  ]

  // Generate random supplier
  const supplier_name = suppliers[Math.floor(Math.random() * suppliers.length)]

  // Generate random amount between 50 and 5000
  const total_amount = parseFloat((Math.random() * (5000 - 50) + 50).toFixed(2))

  return {
    supplier_name,
    total_amount
  }
}

/**
 * Main extraction function
 * This is the interface that will be called by the backend
 * Swap the implementation here when moving to OpenAI
 */
export async function extractInvoiceData(fileUrl: string): Promise<ExtractedInvoiceData> {
  // Currently using mock extraction
  return extractInvoiceDataMock(fileUrl)

  // TO USE OPENAI (uncomment and implement):
  // return extractInvoiceDataWithOpenAI(fileUrl)
}

/**
 * OpenAI extraction implementation (placeholder)
 * Uncomment and implement this when ready to use OpenAI
 */
/*
import OpenAI from 'openai'

export async function extractInvoiceDataWithOpenAI(fileUrl: string): Promise<ExtractedInvoiceData> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY // Add to environment variables
  })

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview", // or "gpt-4o" for better vision
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the supplier name and total amount from this invoice. Return JSON format: {supplier_name: string, total_amount: number}"
            },
            {
              type: "image_url",
              image_url: {
                url: fileUrl
              }
            }
          ]
        }
      ],
      max_tokens: 300
    })

    const content = response.choices[0].message.content
    const extracted = JSON.parse(content || '{}')

    return {
      supplier_name: extracted.supplier_name || 'Unknown Supplier',
      total_amount: parseFloat(extracted.total_amount) || 0.00
    }
  } catch (error) {
    console.error('OpenAI extraction error:', error)
    // Fallback to mock if OpenAI fails
    return extractInvoiceDataMock(fileUrl)
  }
}
*/
