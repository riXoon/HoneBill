export declare const PIN_PATTERN: RegExp;
export declare function isValidPinFormat(pin: unknown): pin is string;
export declare function isHashedPin(stored: string): boolean;
export declare function hashPin(pin: string): Promise<string>;
export declare function constantTimeEqual(a: string, b: string): boolean;
export declare function verifyPin(pin: string, stored: string): Promise<{
    ok: boolean;
    needsRehash: boolean;
}>;
