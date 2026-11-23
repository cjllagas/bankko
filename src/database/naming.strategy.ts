import { DefaultNamingStrategy } from 'typeorm';

// firstName -> First_Name, phoneNumber -> Phone_Number: keeps the Lab 04 column names.
const toLab = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('_');

export class LabNamingStrategy extends DefaultNamingStrategy {
  tableName(className: string, customName: string) { return customName || className; }
  columnName(propertyName: string, customName: string, embeddedPrefixes: string[]) {
    return embeddedPrefixes.length ? super.columnName(propertyName, customName, embeddedPrefixes) : customName || toLab(propertyName);
  }
}
