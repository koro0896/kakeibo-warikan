// PrismaClient はアプリ全体で1つだけ使い回す
const { PrismaClient } = require('@prisma/client');
module.exports = new PrismaClient();
