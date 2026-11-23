import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
  registerDecorator, ValidationArguments,
} from 'class-validator';

const noControlChars = /^[^\u0000-\u001f\u007f]*$/;
const emptyToUndefined = ({ value }: { value: any }) => (value === '' || value === null ? undefined : value);
const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);

/** Required text field: trimmed, 1..max characters, no control characters. */
export const SafeString = (max: number) => applyDecorators(
  Transform(trim),
  IsString({ message: '$property must be a string.' }),
  IsNotEmpty({ message: '$property is required.' }),
  MaxLength(max, { message: `$property must not exceed ${max} characters.` }),
  Matches(noControlChars, { message: '$property contains invalid characters.' }),
);

/** Optional text field (same rules once present). */
export const OptString = (max: number) => applyDecorators(Transform(emptyToUndefined), IsOptional(), SafeString(max));

export const OptEnum = (list: readonly string[]) => applyDecorators(
  Transform(emptyToUndefined), IsOptional(),
  IsIn(list, { message: `$property must be ${list.join(', ').replace(/, ([^,]*)$/, ' or $1')}.` }),
);

/** Optional integer that also works for query strings ("12" -> 12; "abc" fails validation). */
export const OptInt = (min = 1, max = 2147483647) => applyDecorators(
  Transform(({ value }) => (value === '' || value === undefined || value === null ? undefined : /^-?\d+$/.test(String(value)) ? Number(value) : NaN)),
  IsOptional(),
  IsInt({ message: '$property must be an integer.' }),
  Min(min, { message: `$property must be at least ${min}.` }),
  Max(max, { message: `$property must be at most ${max}.` }),
);

/** Optional YYYY-MM-DD query value that must be a real calendar date. */
export function OptDate() {
  return applyDecorators(
    Transform(emptyToUndefined), IsOptional(),
    (target: object, key: string) => registerDecorator({
      name: 'isRealDate', target: target.constructor, propertyName: key,
      options: { message: `${key} must be a valid date in YYYY-MM-DD format.` },
      validator: {
        validate: (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
      },
    }),
  );
}

const COMMON = new Set(['password1234', 'password12345', 'passwordpassword', 'qwertyuiop12', '123456789012', '1234567890123', 'iloveyou1234', 'administrator']);

/** Lab 06 measure 8: length 12-72, at least 3 character kinds, not a common password. */
export function StrongPassword() {
  return applyDecorators(
    IsString({ message: 'password is required.' }),
    MinLength(12, { message: 'password must be at least 12 characters.' }),
    MaxLength(72, { message: 'password must not exceed 72 characters.' }),
    (target: object, key: string) => registerDecorator({
      name: 'strongPassword', target: target.constructor, propertyName: key,
      options: { message: 'password must use at least 3 of: lower case, upper case, digits, symbols, and must not be a common password.' },
      validator: {
        validate: (pw: any, _a: ValidationArguments) => {
          if (typeof pw !== 'string') return false;
          const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
          return kinds >= 3 && !COMMON.has(pw.toLowerCase());
        },
      },
    }),
  );
}
