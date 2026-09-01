import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { app } from "../src/app.js";
import { prisma } from "../src/database/prisma.js";

let server: Server;
let baseUrl: string;
const createdEmails: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test API did not bind to TCP");
      baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
      resolve();
    });
  });
});

after(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: createdEmails } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  if (userIds.length > 0) {
    await prisma.workspace.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Expected an authentication cookie");
  return setCookie.split(";", 1)[0] as string;
}

test("protected workspace routes reject anonymous requests", async () => {
  const response = await fetch(`${baseUrl}/workspaces`);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
});

test("automation routes reject anonymous requests", async () => {
  const response = await fetch(`${baseUrl}/workspaces/not-a-workspace/automations`);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
});

test("workflow routes reject anonymous requests", async () => {
  const response = await fetch(`${baseUrl}/workspaces/not-a-workspace/workflows`);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
});

test("registration validates required fields", async () => {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "not-an-email" }),
  });
  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "VALIDATION_ERROR");
});

test("registration requires email verification before workspace RBAC and session flows", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const originalEmail = `integration-wrong-${suffix}@example.com`;
  const correctedEmail = `integration-corrected-${suffix}@example.com`;
  createdEmails.push(originalEmail, correctedEmail);
  const password = "IntegrationPassword123";
  const registrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: originalEmail,
      password,
      firstName: "Integration",
      lastName: "Test",
      companyName: "Integration Test Workspace",
      annualRevenue: "under-50-lakh",
    }),
  });
  assert.equal(registrationResponse.status, 201);
  const firstCookie = cookieFrom(registrationResponse);
  const registration = (await registrationResponse.json()) as {
    data: {
      accessToken: string;
      workspace: { id: string };
      user: { email: string };
      verificationUrl: string;
    };
  };
  assert.equal(registration.data.user.email, originalEmail);

  const authorization = { authorization: `Bearer ${registration.data.accessToken}` };
  const unverifiedWorkspaceResponse = await fetch(`${baseUrl}/workspaces`, {
    headers: authorization,
  });
  assert.equal(unverifiedWorkspaceResponse.status, 403);
  const unverifiedWorkspace = (await unverifiedWorkspaceResponse.json()) as {
    error: { code: string };
  };
  assert.equal(unverifiedWorkspace.error.code, "EMAIL_VERIFICATION_REQUIRED");

  const originalVerificationToken = new URL(registration.data.verificationUrl).searchParams.get("token");
  assert.ok(originalVerificationToken);
  const changeEmailResponse = await fetch(`${baseUrl}/auth/email`, {
    method: "PATCH",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ email: correctedEmail, password }),
  });
  assert.equal(changeEmailResponse.status, 200);
  const changedEmail = (await changeEmailResponse.json()) as {
    data: { email: string; verificationUrl: string };
  };
  assert.equal(changedEmail.data.email, correctedEmail);

  const staleVerificationResponse = await fetch(`${baseUrl}/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: originalVerificationToken }),
  });
  assert.equal(staleVerificationResponse.status, 400);

  const verificationToken = new URL(changedEmail.data.verificationUrl).searchParams.get("token");
  assert.ok(verificationToken);
  const verificationResponse = await fetch(`${baseUrl}/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: verificationToken }),
  });
  assert.equal(verificationResponse.status, 200);

  const currentUserResponse = await fetch(`${baseUrl}/auth/me`, { headers: authorization });
  assert.equal(currentUserResponse.status, 200);
  const currentUser = (await currentUserResponse.json()) as {
    data: {
      email: string;
      emailVerifiedAt: string;
      memberships: Array<{
        workspace: {
          id: string;
          onboardingCompletedAt: string | null;
          country: string | null;
          timezone: string | null;
        };
        role: { slug: string; permissions: string[] };
      }>;
    };
  };
  assert.equal(currentUser.data.email, correctedEmail);
  assert.ok(currentUser.data.emailVerifiedAt);
  assert.equal(currentUser.data.memberships[0]?.role.slug, "owner");
  assert.ok(currentUser.data.memberships[0]?.role.permissions.includes("roles.manage"));
  assert.equal(currentUser.data.memberships[0]?.workspace.onboardingCompletedAt, null);

  const invalidOnboardingResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/onboarding/complete`,
    {
      method: "POST",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Integration Test Workspace",
        country: "India",
        timezone: "Not/A-Timezone",
      }),
    },
  );
  assert.equal(invalidOnboardingResponse.status, 422);

  const rolesResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/roles`,
    { headers: authorization },
  );
  assert.equal(rolesResponse.status, 200);
  const roles = (await rolesResponse.json()) as {
    data: Array<{ id: string; slug: string; isSystem: boolean; permissions: string[] }>;
  };
  assert.equal(roles.data.length, 4);
  const ownerRole = roles.data.find((role) => role.slug === "owner");
  assert.ok(ownerRole);
  assert.ok(ownerRole.permissions.includes("contacts.delete"));

  const permissionCatalogResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/permissions`,
    { headers: authorization },
  );
  assert.equal(permissionCatalogResponse.status, 200);
  const permissionCatalog = (await permissionCatalogResponse.json()) as {
    data: Array<{ key: string; label: string; group: string }>;
  };
  assert.ok(permissionCatalog.data.length >= 30);
  assert.ok(permissionCatalog.data.some(({ key, group }) => key === "contacts.phone.view" && group === "contact-data"));

  const teammateEmail = `integration-admin-${suffix}@example.com`;
  createdEmails.push(teammateEmail);
  const teammateRegistrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: teammateEmail,
      password,
      firstName: "Workspace",
      lastName: "Admin",
      companyName: "Admin Test Workspace",
    }),
  });
  assert.equal(teammateRegistrationResponse.status, 201);
  const teammateRegistration = (await teammateRegistrationResponse.json()) as {
    data: { accessToken: string; user: { id: string }; verificationUrl: string };
  };
  const teammateVerificationToken = new URL(teammateRegistration.data.verificationUrl).searchParams.get("token");
  assert.ok(teammateVerificationToken);
  const teammateVerificationResponse = await fetch(`${baseUrl}/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: teammateVerificationToken }),
  });
  assert.equal(teammateVerificationResponse.status, 200);
  const adminRole = roles.data.find((role) => role.slug === "admin");
  assert.ok(adminRole);
  await prisma.workspaceMember.create({
    data: {
      workspaceId: registration.data.workspace.id,
      userId: teammateRegistration.data.user.id,
      roleId: adminRole.id,
    },
  });

  const nonOwnerOnboardingResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/onboarding/complete`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${teammateRegistration.data.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Unauthorized Rename",
        country: "India",
        timezone: "Asia/Kolkata",
      }),
    },
  );
  assert.equal(nonOwnerOnboardingResponse.status, 403);
  const nonOwnerOnboarding = (await nonOwnerOnboardingResponse.json()) as { error: { code: string } };
  assert.equal(nonOwnerOnboarding.error.code, "WORKSPACE_OWNER_REQUIRED");

  const onboardingResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/onboarding/complete`,
    {
      method: "POST",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Integration Customer Care",
        country: "India",
        timezone: "Asia/Kolkata",
      }),
    },
  );
  assert.equal(onboardingResponse.status, 200);
  const onboarding = (await onboardingResponse.json()) as {
    data: { name: string; country: string; timezone: string; onboardingCompletedAt: string };
  };
  assert.equal(onboarding.data.name, "Integration Customer Care");
  assert.equal(onboarding.data.country, "India");
  assert.equal(onboarding.data.timezone, "Asia/Kolkata");
  assert.ok(onboarding.data.onboardingCompletedAt);

  const setupResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/setup`,
    { headers: authorization },
  );
  assert.equal(setupResponse.status, 200);
  const setup = (await setupResponse.json()) as {
    data: {
      progress: {
        workspaceCreated: boolean;
        whatsappConnected: boolean;
        phoneNumberConnected: boolean;
        testMessageSent: boolean;
        completedSteps: number;
        totalSteps: number;
        percentage: number;
        completedAt: string | null;
      };
      whatsapp: { status: string; accountCount: number; phoneNumberCount: number };
      team: { memberCount: number; pendingInvitationCount: number };
    };
  };
  assert.deepEqual(setup.data.progress, {
    workspaceCreated: true,
    whatsappConnected: false,
    phoneNumberConnected: false,
    testMessageSent: false,
    completedSteps: 1,
    totalSteps: 4,
    percentage: 25,
    completedAt: null,
  });
  assert.equal(setup.data.whatsapp.status, "DISCONNECTED");
  assert.equal(setup.data.whatsapp.accountCount, 0);
  assert.equal(setup.data.whatsapp.phoneNumberCount, 0);
  assert.equal(setup.data.team.memberCount, 2);

  const membersResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/members`,
    { headers: authorization },
  );
  assert.equal(membersResponse.status, 200);
  const members = (await membersResponse.json()) as {
    data: Array<{ id: string; user: { email: string }; role: { slug: string }; status: string }>;
  };
  const adminMembership = members.data.find((member) => member.user.email === teammateEmail);
  assert.ok(adminMembership);
  const ownerMembership = members.data.find((member) => member.user.email === correctedEmail);
  assert.ok(ownerMembership);

  const suspendResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/members/${adminMembership.id}/status`,
    {
      method: "PATCH",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ status: "SUSPENDED" }),
    },
  );
  assert.equal(suspendResponse.status, 200);
  const activateResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/members/${adminMembership.id}/status`,
    {
      method: "PATCH",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    },
  );
  assert.equal(activateResponse.status, 200);

  const ownerSuspendResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/members/${ownerMembership.id}/status`,
    {
      method: "PATCH",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ status: "SUSPENDED" }),
    },
  );
  assert.equal(ownerSuspendResponse.status, 400);

  const invitationEmail = `integration-invite-${suffix}@example.com`;
  const invitationResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/invitations`,
    {
      method: "POST",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ email: invitationEmail, roleId: adminRole.id }),
    },
  );
  assert.equal(invitationResponse.status, 201);
  const invitation = (await invitationResponse.json()) as {
    data: { email: string; status: string; emailSent: boolean; invitationUrl?: string };
  };
  assert.equal(invitation.data.email, invitationEmail);
  assert.equal(invitation.data.status, "PENDING");
  assert.equal(invitation.data.emailSent, false);
  assert.ok(invitation.data.invitationUrl);

  const invitedRegistrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: invitationEmail,
      password: "InvitedMemberPassword123",
      firstName: "Invited",
      lastName: "Member",
      companyName: "Ignored for invited users",
      annualRevenue: "under-50-lakh",
      invitationToken: new URL(invitation.data.invitationUrl).searchParams.get("token"),
    }),
  });
  assert.equal(invitedRegistrationResponse.status, 201);
  createdEmails.push(invitationEmail);
  const invitedRegistration = (await invitedRegistrationResponse.json()) as {
    data: { accessToken: string; workspace: null; verificationUrl: string };
  };
  assert.equal(invitedRegistration.data.workspace, null);
  assert.equal(new URL(invitedRegistration.data.verificationUrl).searchParams.get("invitation"), new URL(invitation.data.invitationUrl).searchParams.get("token"));

  const invitedVerificationToken = new URL(invitedRegistration.data.verificationUrl).searchParams.get("token");
  assert.ok(invitedVerificationToken);
  const invitedVerificationResponse = await fetch(`${baseUrl}/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: invitedVerificationToken }),
  });
  assert.equal(invitedVerificationResponse.status, 200);

  const invitedMeResponse = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${invitedRegistration.data.accessToken}` },
  });
  assert.equal(invitedMeResponse.status, 200);
  const invitedMe = (await invitedMeResponse.json()) as {
    data: { memberships: Array<{ workspace: { id: string }; role: { id: string } }> };
  };
  assert.equal(invitedMe.data.memberships.length, 1);
  assert.equal(invitedMe.data.memberships[0]?.workspace.id, registration.data.workspace.id);
  assert.equal(invitedMe.data.memberships[0]?.role.id, adminRole.id);

  const immutableOwnerResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/roles/${ownerRole.id}`,
    {
      method: "PATCH",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ permissions: ["workspace.read"] }),
    },
  );
  assert.equal(immutableOwnerResponse.status, 400);
  const immutableOwner = (await immutableOwnerResponse.json()) as { error: { code: string } };
  assert.equal(immutableOwner.error.code, "OWNER_ROLE_IMMUTABLE");

  const updateAdminPermissionsResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/roles/${adminRole.id}`,
    {
      method: "PATCH",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ permissions: ["workspace.read", "contacts.read"] }),
    },
  );
  assert.equal(updateAdminPermissionsResponse.status, 200);

  const customRoleResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/roles`,
    {
      method: "POST",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Quality Reviewer",
        permissions: ["workspace.read"],
      }),
    },
  );
  assert.equal(customRoleResponse.status, 201);
  const customRole = (await customRoleResponse.json()) as { data: { id: string } };
  const updateCustomRoleResponse = await fetch(
    `${baseUrl}/workspaces/${registration.data.workspace.id}/roles/${customRole.data.id}`,
    {
      method: "PATCH",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ permissions: ["workspace.read", "contacts.read", "reports.read"] }),
    },
  );
  assert.equal(updateCustomRoleResponse.status, 200);

  const refreshResponse = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { cookie: firstCookie },
  });
  assert.equal(refreshResponse.status, 200);
  const rotatedCookie = cookieFrom(refreshResponse);
  assert.notEqual(rotatedCookie, firstCookie);

  const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { cookie: rotatedCookie },
  });
  assert.equal(logoutResponse.status, 204);

  const reusedRefreshResponse = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { cookie: rotatedCookie },
  });
  assert.equal(reusedRefreshResponse.status, 401);

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: correctedEmail, password }),
  });
  assert.equal(loginResponse.status, 200);
  const login = (await loginResponse.json()) as { data: { accessToken: string } };
  assert.ok(login.data.accessToken);
});
