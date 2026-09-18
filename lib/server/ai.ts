/**
 * OmniRoute AI Gateway Helper for BidSure
 * 
 * This module provides AI capabilities for the procurement/tender system
 * using the OmniRoute AI router running locally at http://localhost:20128
 */

const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL || 'http://localhost:20128';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Send a chat completion request to OmniRoute
 */
export async function chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const response = await fetch(`${OMNIROUTE_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model || 'auto',
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`OmniRoute API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Check if OmniRoute server is running
 */
export async function isOmniRouteRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${OMNIROUTE_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'auto',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Procurement-specific AI helpers
// ---------------------------------------------------------------------------

/**
 * Analyze a document for compliance issues
 */
export async function analyzeDocumentCompliance(
  documentText: string,
  requirements: string[]
): Promise<{ compliant: boolean; issues: string[]; recommendations: string[] }> {
  const systemPrompt = `You are a procurement compliance expert. Analyze the document against the given requirements.
Return a JSON response with:
- compliant: boolean (true if all requirements are met)
- issues: string[] (list of non-compliance issues found)
- recommendations: string[] (list of recommendations to fix issues)`;

  const userPrompt = `Document content:
${documentText}

Requirements to check:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Analyze this document for compliance.`;

  const response = await chatCompletion({
    model: 'auto',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  
  // Try to parse JSON from the response
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // If parsing fails, return a basic structure
  }

  return {
    compliant: false,
    issues: ['Unable to parse AI response'],
    recommendations: [content],
  };
}

/**
 * Generate a bid summary from tender details
 */
export async function generateBidSummary(
  tenderTitle: string,
  tenderValue: string,
  requirements: string[]
): Promise<string> {
  const response = await chatCompletion({
    model: 'auto',
    messages: [
      {
        role: 'system',
        content: 'You are a procurement expert. Generate a concise bid summary for a tender.',
      },
      {
        role: 'user',
        content: `Generate a bid summary for:
Title: ${tenderTitle}
Value: ${tenderValue}
Key Requirements: ${requirements.join(', ')}`,
      },
    ],
    temperature: 0.5,
    max_tokens: 500,
  });

  return response.choices[0].message.content;
}

/**
 * Assess risk for a bidder based on their submission
 */
export async function assessBidderRisk(
  bidderName: string,
  documents: string[],
  complianceScore: number
): Promise<{ riskLevel: 'Low' | 'Medium' | 'High'; factors: string[] }> {
  const response = await chatCompletion({
    model: 'auto',
    messages: [
      {
        role: 'system',
        content: `You are a risk assessment expert for procurement. Assess the risk level of a bidder.
Return a JSON response with:
- riskLevel: "Low" | "Medium" | "High"
- factors: string[] (list of risk factors considered)`,
      },
      {
        role: 'user',
        content: `Assess risk for bidder:
Name: ${bidderName}
Documents submitted: ${documents.join(', ')}
Compliance score: ${complianceScore}%`,
      },
    ],
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // If parsing fails, return a basic structure
  }

  return {
    riskLevel: 'Medium',
    factors: ['Unable to parse AI response'],
  };
}
