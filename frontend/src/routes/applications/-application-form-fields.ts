import type { AnswerField, FormStep } from '../../api/applicant-applications'

export interface FormFieldDefinition {
  name: AnswerField
  label: string
  /** Input purpose for autofill (WCAG 1.3.5), where one applies. */
  autoComplete?: string
}

/** Text fields of each step, in display order, keyed by API wire name. */
export const stepFields: Record<FormStep, readonly FormFieldDefinition[]> = {
  'personal-details': [
    { name: 'name', label: 'Name', autoComplete: 'name' },
    { name: 'dateOfBirth', label: 'Date of birth', autoComplete: 'bday' },
    { name: 'country', label: 'Country' },
    { name: 'nationality', label: 'Nationality' },
    { name: 'email', label: 'Email', autoComplete: 'email' },
    { name: 'phone', label: 'Phone', autoComplete: 'tel' },
  ],
  'identity-and-address': [
    { name: 'documentType', label: 'Document type' },
    { name: 'documentNumber', label: 'Document number' },
    { name: 'documentCountry', label: 'Document country' },
    { name: 'expiry', label: 'Expiry' },
    { name: 'street', label: 'Street', autoComplete: 'street-address' },
    { name: 'city', label: 'City', autoComplete: 'address-level2' },
    { name: 'postal', label: 'Postal code', autoComplete: 'postal-code' },
    {
      name: 'residentialCountry',
      label: 'Residential country',
      autoComplete: 'country-name',
    },
  ],
}

export const stepTitles: Record<FormStep, string> = {
  'personal-details': 'Personal details',
  'identity-and-address': 'Identity and address',
}

/** Id of a field's input, used by error summary links. */
export function fieldId(name: string): string {
  return `application-${name}`
}
