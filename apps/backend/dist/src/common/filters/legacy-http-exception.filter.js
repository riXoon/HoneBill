"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LegacyHttpExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyHttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let LegacyHttpExceptionFilter = LegacyHttpExceptionFilter_1 = class LegacyHttpExceptionFilter {
    logger = new common_1.Logger(LegacyHttpExceptionFilter_1.name);
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if ('retryAfterSeconds' in exception &&
                typeof exception.retryAfterSeconds === 'number') {
                response.setHeader('Retry-After', String(exception.retryAfterSeconds));
            }
            else if (status === 423 &&
                typeof exceptionResponse === 'object' &&
                exceptionResponse !== null &&
                'retryAfter' in exceptionResponse &&
                typeof exceptionResponse.retryAfter === 'number') {
                response.setHeader('Retry-After', String(exceptionResponse.retryAfter));
            }
            if (typeof exceptionResponse === 'string') {
                response.status(status).json({ error: exceptionResponse });
                return;
            }
            if (typeof exceptionResponse === 'object' &&
                exceptionResponse !== null &&
                'found' in exceptionResponse &&
                exceptionResponse.found === false) {
                response.status(status).json({ found: false });
                return;
            }
            if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                const responseBody = exceptionResponse;
                const error = typeof responseBody.message === 'string'
                    ? responseBody.message
                    : typeof responseBody.error === 'string'
                        ? responseBody.error
                        : exception.message;
                const legacyBody = { error };
                if (typeof responseBody.attemptsRemaining === 'number') {
                    legacyBody.attemptsRemaining = responseBody.attemptsRemaining;
                }
                if (typeof responseBody.retryAfter === 'number') {
                    legacyBody.retryAfter = responseBody.retryAfter;
                }
                if (typeof responseBody.code === 'string') {
                    legacyBody.code = responseBody.code;
                }
                response.status(status).json(legacyBody);
                return;
            }
            response.status(status).json({ error: exception.message });
            return;
        }
        this.logger.error(exception instanceof Error ? exception.stack : String(exception));
        response.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
            error: 'Internal Server Error',
        });
    }
};
exports.LegacyHttpExceptionFilter = LegacyHttpExceptionFilter;
exports.LegacyHttpExceptionFilter = LegacyHttpExceptionFilter = LegacyHttpExceptionFilter_1 = __decorate([
    (0, common_1.Catch)()
], LegacyHttpExceptionFilter);
//# sourceMappingURL=legacy-http-exception.filter.js.map