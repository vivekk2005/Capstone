import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('Admin@1234', 12);
  const instructorHash = await bcrypt.hash('Instructor@1234', 12);
  const facilityHash = await bcrypt.hash('Facility@1234', 12);
  const studentHash = await bcrypt.hash('Student@1234', 12);

  await prisma.user.upsert({
    where: { email: 'admin@centreguard.local' },
    update: {},
    create: {
      email: 'admin@centreguard.local',
      passwordHash: adminHash,
      fullName: 'Centre Administrator',
      role: 'ADMIN',
    },
  });

  const instructorUser = await prisma.user.upsert({
    where: { email: 'instructor@centreguard.local' },
    update: {},
    create: {
      email: 'instructor@centreguard.local',
      passwordHash: instructorHash,
      fullName: 'Prof. Arjun Mehta',
      role: 'INSTRUCTOR',
    },
  });

  await prisma.instructor.upsert({
    where: { userId: instructorUser.id },
    update: {},
    create: {
      userId: instructorUser.id,
      employeeCode: 'INS-1001',
      department: 'Computer Science & Engineering',
      phone: '9876543210',
      specialization: 'Full-Stack Development & AI',
    },
  });

  await prisma.user.upsert({
    where: { email: 'facility@centreguard.local' },
    update: {},
    create: {
      email: 'facility@centreguard.local',
      passwordHash: facilityHash,
      fullName: 'Rakesh Sharma (Facility Manager)',
      role: 'FACILITY_MANAGER',
    },
  });

  const studentUser = await prisma.user.upsert({
    where: { email: 'student@centreguard.local' },
    update: {},
    create: {
      email: 'student@centreguard.local',
      passwordHash: studentHash,
      fullName: 'Aarav Verma',
      role: 'STUDENT',
    },
  });

  await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      studentCode: '12319598',
      phone: '9123456789',
      courseBatch: 'BTECH-CSE-2027',
    },
  });

  const room = await prisma.classroom.upsert({
    where: { roomCode: 'LAB-301' },
    update: {},
    create: {
      roomCode: 'LAB-301',
      name: 'AI & Systems Lab 301',
      building: 'Block 34',
      maxCapacity: 40,
      status: 'AVAILABLE',
    },
  });

  const existingEquipment = await prisma.equipment.count({ where: { classroomId: room.id } });
  if (existingEquipment === 0) {
    await prisma.equipment.createMany({
      data: [
        { classroomId: room.id, itemType: 'COMPUTER', label: 'Desktop Workstation', expectedQuantity: 20 },
        { classroomId: room.id, itemType: 'MONITOR', label: '24-inch Display Monitor', expectedQuantity: 20 },
        { classroomId: room.id, itemType: 'PROJECTOR', label: 'Ceiling HD Projector', expectedQuantity: 1 },
        { classroomId: room.id, itemType: 'FIRE_EXTINGUISHER', label: 'ABC Dry Powder Extinguisher', expectedQuantity: 1 },
      ],
    });
  }

  console.log('Seed completed: 4 role accounts + LAB-301 classroom + equipment inventory.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
