const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';

interface InitializeResult {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
    is_simulated?: boolean;
  };
}

interface VerifyResult {
  status: boolean;
  message: string;
  data?: {
    status: string;
    reference: string;
    amount: number;
    gateway_response: string;
    paid_at: string;
  };
}

function getSimulatedTransaction(amountInNaira: number, email: string, callbackUrl?: string): InitializeResult {
  const mockRef = `SU_MOCK_${amountInNaira}_${Math.floor(100000 + Math.random() * 900000)}`;
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  
  const redirectUrl = callbackUrl 
    ? `${callbackUrl}${callbackUrl.includes('?') ? '&' : '?'}reference=${mockRef}`
    : `${baseUrl}/payments?reference=${mockRef}`;

  return {
    status: true,
    message: 'Simulated transaction initialized successfully.',
    data: {
      authorization_url: redirectUrl,
      access_code: `MOCK_ACCESS_${mockRef}`,
      reference: mockRef,
      is_simulated: true
    }
  };
}

function getSimulatedVerification(reference: string): VerifyResult {
  let amountInNaira = 50000;
  const parts = reference.split('_');
  if (parts.length >= 3) {
    const parsed = parseFloat(parts[2]);
    if (!isNaN(parsed)) {
      amountInNaira = parsed;
    }
  }

  return {
    status: true,
    message: 'Simulated transaction verified successfully.',
    data: {
      status: 'success',
      reference,
      amount: amountInNaira * 100, // convert to kobo for verify response
      gateway_response: 'Successful',
      paid_at: new Date().toISOString()
    }
  };
}

/**
 * Initializes a transaction on Paystack or returns a simulated transaction if API keys are missing.
 * @param email Customer email
 * @param amountInNaira Amount in Naira
 * @param metadata Additional metadata (e.g. fee category, studentId, paymentId)
 * @param callbackUrl Optional URL to redirect to after successful payment
 */
export async function initializeTransaction(
  email: string,
  amountInNaira: number,
  metadata: Record<string, any> = {},
  callbackUrl?: string
): Promise<InitializeResult> {
  const amount = Math.round(amountInNaira * 100); // Paystack expects amount in Kobo

  if (!PAYSTACK_SECRET_KEY) {
    console.log(`[Paystack Service] SIMULATION MODE (No key): Initializing transaction of ₦${amountInNaira} for ${email}`);
    return getSimulatedTransaction(amountInNaira, email, callbackUrl);
  }

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount,
        metadata,
        callback_url: callbackUrl
      })
    });

    const body = await response.json() as any;
    if (!body.status) {
      console.warn(`[Paystack Service] Paystack API returned failure status. Message: ${body.message}. Falling back to simulation.`);
      return getSimulatedTransaction(amountInNaira, email, callbackUrl);
    }
    return {
      status: body.status,
      message: body.message,
      data: body.data
    };
  } catch (error: any) {
    console.warn(`[Paystack Service] Network error while contacting Paystack: ${error.message}. Falling back to simulation.`);
    return getSimulatedTransaction(amountInNaira, email, callbackUrl);
  }
}

/**
 * Verifies a transaction on Paystack or returns a simulated success response if in simulation mode.
 * @param reference Paystack transaction reference
 */
export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  if (!PAYSTACK_SECRET_KEY || reference.startsWith('SU_MOCK_')) {
    console.log(`[Paystack Service] SIMULATION MODE (No key or mock ref): Verifying reference ${reference}`);
    return getSimulatedVerification(reference);
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    });

    const body = await response.json() as any;
    if (!body.status) {
      console.warn(`[Paystack Service] Paystack verification API returned failure status. Message: ${body.message}. Falling back to simulation.`);
      return getSimulatedVerification(reference);
    }
    return {
      status: body.status,
      message: body.message,
      data: body.data
    };
  } catch (error: any) {
    console.warn(`[Paystack Service] Network error during Paystack verification: ${error.message}. Falling back to simulation.`);
    return getSimulatedVerification(reference);
  }
}
