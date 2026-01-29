const request = require('supertest');
const app = require('./service');
const { Role, DB } = require('./database/database.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
// eslint-disable-next-line no-unused-vars
let testUserAuthToken;
// eslint-disable-next-line no-unused-vars
let adminUser;

function randomName() {
    return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
    let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
    user.name = randomName();
    user.email = user.name + '@admin.com';

    user = await DB.addUser(user);
    return { ...user, password: 'toomanysecrets' };
}

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;

  adminUser = await createAdminUser();
});

test('GET - welcome page', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.body.message).toContain('welcome');
  expect(res.body.version).toBeDefined();
});

test('GET invalid route', async () => {
    const res = await request(app).get('/invalidroute');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('unknown endpoint');
    expect(res.body.version).toBeUndefined();
})

test('GET - API docs', async () => {
  const res = await request(app).get('/api/docs');
  expect(res.status).toBe(200);
  expect(res.body.version).toBeDefined();
  expect(res.body.endpoints.length).toBeGreaterThan(0);
  expect(res.body.endpoints).toBeInstanceOf(Array);
  expect(res.body.config).toBeDefined();
});

// Auth route tests

test('register', async () => {
  const newUser = { name: 'test user', email: randomName() + '@test.com', password: 'testpass' };
  const registerRes = await request(app).post('/api/auth').send(newUser);

  expect(registerRes.status).toBe(200);
  expect(registerRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
  expect(registerRes.body.user).toMatchObject({ name: newUser.name, email: newUser.email });
  expect(registerRes.body.user.roles).toBeInstanceOf(Array);
  expect(registerRes.body.user.roles).toEqual([{ role: 'diner' }]);
  expect(registerRes.body.user.password).toBeUndefined();
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  // eslint-disable-next-line no-unused-vars
  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
});

test('logout', async () => {
  const logoutRes = await request(app).delete('/api/auth').set('Authorization', `Bearer ${testUserAuthToken}`);
  
  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');
  
  const loginRes = await request(app).put('/api/auth').send(testUser);
  testUserAuthToken = loginRes.body.token;
});

// User router tests
test('getUser', async () => {
  const res = await request(app).get('/api/user/me').set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ name: testUser.name, email: testUser.email });
  expect(res.body.roles).toBeInstanceOf(Array);
  expect(res.body.roles).toEqual([{ role: 'diner' }]);
  expect(res.body.password).toBeUndefined();
});




