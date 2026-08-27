export type RegistrationFormData = {
  workEmail: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  companyWebsite: string;
  companyLocation: string;
  annualRevenue: string;
};

export function getPasswordValidationError(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Password must contain at least 8 characters.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  if (password !== confirmation) return "Password and confirmation do not match.";
  return null;
}

export function toRegistrationRequest(data: RegistrationFormData, invitationToken?: string) {
  return {
    email: data.workEmail.trim().toLowerCase(),
    password: data.password,
    ...(invitationToken ? { invitationToken } : {}),
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    phone: data.phone.trim(),
    companyName: data.companyName.trim(),
    companyWebsite: data.companyWebsite.trim() || undefined,
    companyLocation: data.companyLocation.trim(),
    annualRevenue: data.annualRevenue,
  };
}
