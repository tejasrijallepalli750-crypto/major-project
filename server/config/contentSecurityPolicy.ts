export const getContentSecurityPolicyDirectives = (isProduction: boolean) => ({
  imgSrc: ["'self'", 'data:'],
  scriptSrc: [
    "'self'",
    'https://checkout.razorpay.com',
    ...(!isProduction ? ["'unsafe-inline'"] : []),
  ],
  frameSrc: ["'self'", 'https://checkout.razorpay.com', 'https://api.razorpay.com'],
  connectSrc: [
    "'self'",
    'https://api.razorpay.com',
    'https://lumberjack.razorpay.com',
    ...(!isProduction ? ['ws:'] : []),
  ],
  workerSrc: ["'self'", 'blob:'],
  ...(!isProduction ? { styleSrc: ["'self'", "'unsafe-inline'"] } : {}),
});

export const getHelmetOptions = (isProduction: boolean) => ({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' as const },
  contentSecurityPolicy: {
    directives: getContentSecurityPolicyDirectives(isProduction),
  },
});
