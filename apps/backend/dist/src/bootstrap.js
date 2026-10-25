"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApp = configureApp;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
function configureApp(app) {
    const configService = app.get(config_1.ConfigService);
    const corsOrigin = configService.get('CORS_ORIGIN', '*');
    app.setGlobalPrefix('api', {
        exclude: [{ path: '.well-known/(.*)', method: common_1.RequestMethod.ALL }],
    });
    app.enableCors({
        origin: corsOrigin,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Signature',
            'X-Textbee-Signature',
        ],
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('HoneBill Backend API')
        .setDescription('NestJS migration backend API')
        .setVersion('1.0.0')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
    const express = app.getHttpAdapter().getInstance();
    express.get('/api/swagger', (_req, res) => {
        res.json(document);
    });
}
//# sourceMappingURL=bootstrap.js.map