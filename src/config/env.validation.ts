import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1024)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty({
    message: 'FSPIOP_DFSP_ID is required to identify this connector',
  })
  FSPIOP_DFSP_ID: string;

  @IsString()
  @IsNotEmpty()
  DEFAULT_CURRENCY: string = 'USD';

  @IsUrl({ require_tld: false })
  @IsNotEmpty({
    message: 'HUB_BASE_URL is required to route callbacks to the switch',
  })
  HUB_BASE_URL: string;

  @IsInt()
  @Min(1000)
  @IsOptional()
  CALLBACK_TIMEOUT_MS: number = 5000;

  @IsInt()
  @Min(10)
  @IsOptional()
  QUOTE_EXPIRY_SECONDS: number = 60;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => Object.values(error.constraints || {}).join(', '))
      .join('\n');
    throw new Error(
      `[Configuration Error] Invalid environment variables:\n${errorMessages}`,
    );
  }

  return validatedConfig;
}
