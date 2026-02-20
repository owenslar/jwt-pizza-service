const request = require('supertest');
const app = require('./service');
const { Role, DB } = require('./database/database.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };

let testUserAuthToken;
let adminUser;
let adminUserAuthToken;

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

async function registerUser(service) {
  const testUser = {
    name: 'pizza diner',
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const registerRes = await service.post('/api/auth').send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  testUser.id = registerRes.body.user.id;

  adminUser = await createAdminUser();
  const adminLoginRes = await request(app).put('/api/auth').send(adminUser);
  adminUserAuthToken = adminLoginRes.body.token;
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
});

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
  const newUser = {
    name: 'test user',
    email: randomName() + '@test.com',
    password: 'testpass',
  };
  const registerRes = await request(app).post('/api/auth').send(newUser);

  expect(registerRes.status).toBe(200);
  expect(registerRes.body.token).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );
  expect(registerRes.body.user).toMatchObject({
    name: newUser.name,
    email: newUser.email,
  });
  expect(registerRes.body.user.roles).toBeInstanceOf(Array);
  expect(registerRes.body.user.roles).toEqual([{ role: 'diner' }]);
  expect(registerRes.body.user.password).toBeUndefined();
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );

  // eslint-disable-next-line no-unused-vars
  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
});

test('logout', async () => {
  const logoutRes = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');

  const loginRes = await request(app).put('/api/auth').send(testUser);
  testUserAuthToken = loginRes.body.token;
});

// User router tests
test('getUser', async () => {
  const res = await request(app)
    .get('/api/user/me')
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    name: testUser.name,
    email: testUser.email,
  });
  expect(res.body.roles).toBeInstanceOf(Array);
  expect(res.body.roles).toEqual([{ role: 'diner' }]);
  expect(res.body.password).toBeUndefined();
});

test('updateUser', async () => {
  const res = await request(app)
    .put(`/api/user/${testUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: 'updated name', email: 'updated@test.com' });
  expect(res.status).toBe(200);
  expect(res.body.user).toMatchObject({
    name: 'updated name',
    email: 'updated@test.com',
  });
  expect(res.body.token).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );
  testUserAuthToken = res.body.token;
  expect(res.body.user.password).toBeUndefined();
});

test('delete users unauthorized', async () => {
  const res = await request(app).delete('/api/user/1');
  expect(res.status).toBe(401);
});

test('delete user as admin', async () => {
  const newUser = await registerUser(request(app));
  const res = await request(app)
    .delete(`/api/user/${newUser.id}`)
    .set('Authorization', `Bearer ${adminUserAuthToken}`);
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('successfully deleted user');
});

test('delete user not as admin', async () => {
  const newUser = await registerUser(request(app));
  const res = await request(app)
    .delete(`/api/user/${newUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(res.status).toBe(403);
  expect(res.body.message).toBe('unauthorized');
});

test('list users unauthorized', async () => {
  const listUsersRes = await request(app).get('/api/user');
  expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
  // Create a user with a unique name to avoid pagination issues
  const uniqueName = 'ListTestUser' + randomName();
  const testUser = {
    name: uniqueName,
    email: `${randomName()}@listtest.com`,
    password: 'testpass',
  };
  const registerRes = await request(app).post('/api/auth').send(testUser);
  const user = registerRes.body.user;
  const userToken = registerRes.body.token;

  // List all users without filter to verify the endpoint works
  const listUsersRes = await request(app)
    .get('/api/user?page=0&limit=100')
    .set('Authorization', 'Bearer ' + userToken);
  expect(listUsersRes.status).toBe(200);
  expect(listUsersRes.body).toBeInstanceOf(Object);
  expect(listUsersRes.body.users).toBeInstanceOf(Array);
  expect(listUsersRes.body.users.length).toBeGreaterThan(0);

  // Search for the specific user by name to ensure they exist (works regardless of DB size)
  const filterRes = await request(app)
    .get(`/api/user?page=0&limit=100&name=${uniqueName}`)
    .set('Authorization', 'Bearer ' + userToken);
  expect(filterRes.status).toBe(200);
  expect(filterRes.body.users).toContainEqual({
    id: user.id,
    name: uniqueName,
    email: testUser.email,
    roles: [{ role: 'diner' }],
  });
});

test('list users with bad params', async () => {
  const listUsersRes = await request(app)
    .get('/api/user?page=1000&limit=10')
    .set('Authorization', 'Bearer ' + testUserAuthToken);
  expect(listUsersRes.body.users).toEqual([]);
  expect(listUsersRes.body.more).toBe(false);
});

test('list users with name filter', async () => {
  // Create a user with a unique name for filtering
  const uniqueName = 'FilterTestUser' + randomName();
  const filterTestUser = {
    name: uniqueName,
    email: `${randomName()}@filter.com`,
    password: 'testpass',
  };
  const registerRes = await request(app).post('/api/auth').send(filterTestUser);
  const createdUser = registerRes.body.user;

  // Search for the user by name
  const listUsersRes = await request(app)
    .get(`/api/user?page=0&limit=100&name=${uniqueName}`)
    .set('Authorization', 'Bearer ' + testUserAuthToken);
  expect(listUsersRes.status).toBe(200);
  expect(listUsersRes.body.users).toBeInstanceOf(Array);
  expect(listUsersRes.body.users.length).toBe(1);
  expect(listUsersRes.body.users).toContainEqual({
    id: createdUser.id,
    name: uniqueName,
    email: filterTestUser.email,
    roles: [{ role: 'diner' }],
  });
  expect(listUsersRes.body.users[0].password).toBeUndefined();
});

test('list users with broad filter', async () => {
  const listUsersRes = await request(app)
    .get(`/api/user?page=0&limit=10&name=*e*`)
    .set('Authorization', 'Bearer ' + testUserAuthToken);
  expect(listUsersRes.status).toBe(200);
  expect(listUsersRes.body.users).toBeInstanceOf(Array);
  expect(listUsersRes.body.users.length).toBeGreaterThan(0);
  expect(listUsersRes.body.users[0].password).toBeUndefined();
});

// Order router tests
test('getMenu', async () => {
  const res = await request(app).get('/api/order/menu');
  expect(res.status).toBe(200);
  expect(res.body).toBeInstanceOf(Array);
  expect(res.body.length).toBeDefined();
});

test('addMenuItem unauthorized', async () => {
  const res = await request(app)
    .put('/api/order/menu')
    .send({ description: 'Test Item', price: 9.99 });
  expect(res.status).toBe(401);
  expect(res.body.message).toContain('unauthorized');
});

test('addMenuItem successful', async () => {
  const itemTitle = randomName();
  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminUserAuthToken}`)
    .send({
      title: itemTitle,
      description: 'Test Description',
      image: 'test.png',
      price: 9.99,
    });
  expect(res.status).toBe(200);
  expect(res.body).toBeInstanceOf(Array);
  const addedItem = res.body.find(
    (item) => item.title === itemTitle && item.price === 9.99,
  );
  expect(addedItem).toBeDefined();
});

test('getOrders', async () => {
  const res = await request(app)
    .get('/api/order')
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(res.status).toBe(200);
  expect(res.body).toBeInstanceOf(Object);
  expect(res.body.orders).toBeInstanceOf(Array);
});

test('createOrder', async () => {
  const menuRes = await request(app).get('/api/order/menu');
  const menuItem = menuRes.body[0];

  const orderRes = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({
      franchiseId: 1,
      storeId: 1,
      items: [
        {
          menuId: menuItem.id,
          description: menuItem.description,
          price: menuItem.price,
        },
      ],
    });

  expect(orderRes.status).toBe(200);
  expect(orderRes.body.order).toBeDefined();
  expect(orderRes.body.order.id).toBeDefined();
  expect(orderRes.body.order.items).toBeInstanceOf(Array);
  expect(orderRes.body.order.items.length).toBe(1);
  expect(orderRes.body.order.items[0]).toMatchObject({
    menuId: menuItem.id,
    description: menuItem.description,
    price: menuItem.price,
  });
});

// Franchise router tests
test('getFranchises', async () => {
  const res = await request(app)
    .get('/api/franchise')
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(res.status).toBe(200);
  expect(res.body).toBeInstanceOf(Object);
  expect(res.body.franchises).toBeInstanceOf(Array);
  expect(res.body.franchises.length).toBeDefined();
});

test('getUserFranchises', async () => {
  const res = await request(app)
    .get(`/api/franchise/${testUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(res.status).toBe(200);
  expect(res.body).toBeInstanceOf(Array);
  expect(res.body.length).toBe(0);
});

test('getUserFranchises unauthorized', async () => {
  const res = await request(app)
    .get(`/api/franchise/${adminUser.id}`)
    .set('Authorization', `Bearer faketoken`);
  expect(res.status).toBe(401);
});

test('createFranchise', async () => {
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminUserAuthToken}`)
    .send({ name: randomName(), admins: [{ email: adminUser.email }] });

  expect(res.status).toBe(200);
  expect(res.body.name).toBeDefined();
  expect(res.body.id).toBeDefined();
});

test('deleteFranchise', async () => {
  const createRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminUserAuthToken}`)
    .send({ name: randomName(), admins: [{ email: adminUser.email }] });

  expect(createRes.status).toBe(200);
  const franchiseId = createRes.body.id;

  const deleteRes = await request(app).delete(`/api/franchise/${franchiseId}`);

  expect(deleteRes.status).toBe(200);
  expect(deleteRes.body.message).toBe('franchise deleted');
});

test('createStore', async () => {
  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminUserAuthToken}`)
    .send({ name: randomName(), admins: [{ email: adminUser.email }] });

  expect(franchiseRes.status).toBe(200);
  const franchiseId = franchiseRes.body.id;

  const storeName = randomName();

  const storeRes = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set('Authorization', `Bearer ${adminUserAuthToken}`)
    .send({ name: storeName });

  expect(storeRes.status).toBe(200);
  expect(storeRes.body.name).toBeDefined();
  expect(storeRes.body.name).toBe(storeName);
  expect(storeRes.body.id).toBeDefined();
});

test('deleteStore', async () => {
  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminUserAuthToken}`)
    .send({ name: randomName(), admins: [{ email: adminUser.email }] });

  expect(franchiseRes.status).toBe(200);
  const franchiseId = franchiseRes.body.id;

  const storeRes = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set('Authorization', `Bearer ${adminUserAuthToken}`)
    .send({ name: randomName() });

  expect(storeRes.status).toBe(200);
  const storeId = storeRes.body.id;

  const deleteRes = await request(app)
    .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
    .set('Authorization', `Bearer ${adminUserAuthToken}`);

  expect(deleteRes.status).toBe(200);
  expect(deleteRes.body.message).toBe('store deleted');
});

// Extra tests for more coverage
test('register with missing fields', async () => {
  const res = await request(app).post('/api/auth').send({ name: 'test' });
  expect(res.status).toBe(400);
});

test('login with incorrect password', async () => {
  const res = await request(app)
    .put('/api/auth')
    .send({ email: testUser.email, password: 'wrongpassword' });
  expect(res.status).toBe(404);
});

test('updateUser as different user - forbidden', async () => {
  const res = await request(app)
    .put(`/api/user/999`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: 'hacker', email: 'hacker@test.com', password: 'hacker' });

  expect(res.status).toBe(403);
});

test('addMenuItem as non-admin - forbidden', async () => {
  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({
      title: randomName(),
      description: 'Test',
      image: 'test.png',
      price: 1.99,
    });

  expect(res.status).toBe(403);
});

test('createFranchise as non-admin - forbidden', async () => {
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: randomName(), admins: [{ email: testUser.email }] });

  expect(res.status).toBe(403);
});

test('createStore without authorization - forbidden', async () => {
  const res = await request(app)
    .post(`/api/franchise/1/store`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: randomName() });

  expect(res.status).toBe(403);
});

test('deleteStore without authorization - forbidden', async () => {
  const res = await request(app)
    .delete(`/api/franchise/1/store/1`)
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(403);
});
