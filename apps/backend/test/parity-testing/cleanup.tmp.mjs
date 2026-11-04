import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const all = {
  legacy: [
    'GAVFQRBHIA4R2KOCXFNXATCOCUONT3XENQLIFHHQR2G6RZ2VTVI3TORP',
    'GDLE2FWXBLTJ6KI6RA4PTNYIMGSGTEFTM5ANOANBTI5ZBGOY64W6OC6R',
    'GAYNQQLWLRCVNCT7AAZUPZW3BUAH6DFJHFTJTQUJA7UBQQESGW3V6IV3',
  ],
  nest: [
    'GCPPYVDEPU6TLQ3PFHYJ4SSLSJQZCDEM5VXXHW5QFPOYJ4Y2HN5N7E6B',
    'GD3IT4LF2AS5UMQ5STNTICA3Z5LY3W7ZPHS3FQMWGH6AUSTDSCLCGSYD',
    'GD5HJHOXTM7P3SLE4FNVS2MQCNO3K35T33H7VOF655GHNQ5CP5YFYMJF',
  ],
};

const database = process.env.DB;
const keys =
  database === 'both'
    ? [...all.legacy, ...all.nest]
    : all[database];
if (!keys) {
  throw new Error('Set DB=legacy, DB=nest, or DB=both.');
}
if (!process.env.DATABASE_URL) {
  throw new Error('Set DATABASE_URL for the selected database.');
}
const databaseUrl = new URL(process.env.DATABASE_URL);
console.log(
  'target:',
  databaseUrl.hostname,
  databaseUrl.port,
  databaseUrl.pathname.slice(1),
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  const notDemo = { demoSenderPair: null, demoReceiverPair: null };
  const recorded = await prisma.account.findMany({
    where: { stellarPublicKey: { in: keys }, ...notDemo },
    select: {
      id: true,
      shortId: true,
      stellarPublicKey: true,
      createdAt: true,
    },
  });

  const since = new Date(
    process.env.SINCE ?? Date.now() - 24 * 60 * 60 * 1000,
  );
  if (Number.isNaN(since.getTime())) {
    throw new Error('SINCE must be a valid date/time.');
  }
  const suspects = await prisma.account.findMany({
    where: {
      createdAt: { gte: since },
      role: 'USER',
      pin: null,
      phoneNumber: null,
      offlineDeviceKey: null,
      stellarPublicKey: { notIn: keys },
      ...notDemo,
    },
    select: {
      id: true,
      shortId: true,
      stellarPublicKey: true,
      firstName: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const known = [...recorded, ...suspects];
  const siblings = known.length
    ? await prisma.account.findMany({
        where: {
          id: { notIn: known.map((account) => account.id) },
          phoneNumber: null,
          offlineDeviceKey: null,
          ...notDemo,
          OR: known.map((account) => ({
            createdAt: {
              gte: new Date(account.createdAt.getTime() - 3000),
              lte: new Date(account.createdAt.getTime() + 3000),
            },
          })),
        },
        select: {
          id: true,
          shortId: true,
          stellarPublicKey: true,
          firstName: true,
          email: true,
          pin: true,
          createdAt: true,
        },
      })
    : [];

  console.log(`database: ${database}`);
  console.log('recorded:', recorded.length, recorded);
  console.log('suspects (review before including):', suspects.length, suspects);
  console.log(
    'siblings (review before including):',
    siblings.length,
    siblings.map((account) => ({
      ...account,
      pin: account.pin ? '<set>' : null,
    })),
  );

  if (process.env.DELETE === 'yes') {
    const extra =
      process.env.INCLUDE_SUSPECTS === 'yes'
        ? [...suspects, ...siblings]
        : [];
    const ids = [...recorded, ...extra].map((account) => account.id);
    const result = await prisma.account.deleteMany({
      where: {
        id: { in: ids },
        ...notDemo,
      },
    });
    console.log('deleted:', result.count);
  } else {
    console.log(
      'Dry run only. Set DELETE=yes to delete recorded keys; also set INCLUDE_SUSPECTS=yes to include reviewed suspects and siblings.',
    );
  }
} finally {
  await prisma.$disconnect();
}
