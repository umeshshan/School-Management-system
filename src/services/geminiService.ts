import { GoogleGenAI, ThinkingLevel } from '@google/genai';

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateLowLatencyAcademicInsight(params: {
  mode: 'student_remark' | 'class_summary';
  context: Record<string, unknown>;
}): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add it in Settings > Secrets.'
    );
  }

  const systemInstruction =
    params.mode === 'student_remark'
      ? 'You are an experienced school class teacher writing a concise, constructive, encouraging 2-sentence official report card remark based strictly on the provided verified marks and attendance data. Use plain professional English.'
      : 'You are an academic dean summarizing verified examination performance metrics for a school report. Provide 3 concise, actionable bullet insights based strictly on the provided numbers.';

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: JSON.stringify(params.context),
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });

  return (response.text || '').trim();
}
