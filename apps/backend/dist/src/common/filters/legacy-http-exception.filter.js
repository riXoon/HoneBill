"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyHttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let LegacyHttpExceptionFilter = class LegacyHttpExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (typeof exceptionResponse === 'string') {
                response.status(status).json({ error: exceptionResponse });
                return;
            }
            if (typeof exceptionResponse === 'object' &&
                exceptionResponse !== null &&
                'error' in exceptionResponse &&
                typeof exceptionResponse.error === 'string') {
                response.status(status).json({ error: exceptionResponse.error });
                return;
            }
            if (typeof exceptionResponse === 'object' &&
                exceptionResponse !== null &&
                'message' in exceptionResponse &&
                typeof exceptionResponse.message === 'string') {
                response.status(status).json({ error: exceptionResponse.message });
                return;
            }
            response.status(status).json({ error: exception.message });
            return;
        }
        response.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
            error: 'Internal Server Error',
        });
    }
};
exports.LegacyHttpExceptionFilter = LegacyHttpExceptionFilter;
exports.LegacyHttpExceptionFilter = LegacyHttpExceptionFilter = __decorate([
    (0, common_1.Catch)()
], LegacyHttpExceptionFilter);
//# sourceMappingURL=legacy-http-exception.filter.js.map