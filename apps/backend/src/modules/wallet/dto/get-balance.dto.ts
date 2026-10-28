import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, Matches } from 'class-validator';
import { ASSET_ISSUERS } from '../wallet.constants';

const supported = Object.keys(ASSET_ISSUERS);

export class GetBalanceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Missing required query parameter: publicKey' })
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'Invalid Stellar public key format.' })
  publicKey!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsNotEmpty({ message: 'Missing required query parameter: assetCode' })
  @IsIn(supported, {
    message: `Unsupported asset code. Supported assets: ${supported.join(', ')}`,
  })
  assetCode!: string;
}