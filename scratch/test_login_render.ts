import https from 'https';

const HOST = 'cantina-escolar.onrender.com';

function request(method: string, path: string, body?: any): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const options: https.RequestOptions = {
      hostname: HOST,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    };

    if (body) {
      options.headers!['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, data });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(postData);
    }
    req.end();
  });
}

async function testHealth() {
  console.log('--- Testing API Health ---');
  try {
    const res = await request('GET', '/api/health');
    console.log('Health Status:', res.status);
    console.log('Health response:', res.data);
  } catch (err: any) {
    console.error('Health request failed:', err.message);
  }
}

async function testLogin(payload: any, label: string) {
  console.log(`\n--- Testing Login: ${label} ---`);
  console.log('Payload:', JSON.stringify(payload));
  try {
    const res = await request('POST', '/api/auth/login', payload);
    console.log('Response Status:', res.status);
    console.log('Response Body:', res.data);
  } catch (err: any) {
    console.log('Request failed:', err.message);
  }
}

async function run() {
  await testHealth();

  // Test Case 1: Correct admin credentials with default school UUID
  await testLogin({
    email: 'admin@cantina.com',
    password: 'Admin@123',
    schoolId: 'a0000000-0000-0000-0000-000000000001'
  }, 'Admin seeded credentials');

  // Test Case 2: Seeded admin with wrong password
  await testLogin({
    email: 'admin@cantina.com',
    password: 'WrongPassword',
    schoolId: 'a0000000-0000-0000-0000-000000000001'
  }, 'Seeded admin with WRONG password');

  // Test Case 3: Missing schoolId (should fail with 400 validation error)
  await testLogin({
    email: 'admin@cantina.com',
    password: 'Admin@123'
  }, 'Missing schoolId');

  // Test Case 4: Invalid schoolId UUID (should fail with 400 validation error)
  await testLogin({
    email: 'admin@cantina.com',
    password: 'Admin@123',
    schoolId: 'invalid-uuid-string'
  }, 'Invalid UUID schoolId');
}

run();
