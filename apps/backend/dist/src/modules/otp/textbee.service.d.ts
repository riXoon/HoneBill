import { ConfigService } from '@nestjs/config';
interface SendOptions {
    retries?: number;
    timeoutMs?: number;
    deadlineMs?: number;
}
export declare class TextbeeService {
    private readonly config;
    constructor(config: ConfigService);
    send(phoneNumber: string, message: string, options?: SendOptions): Promise<void>;
    private getGatewayConfig;
}
export {};
