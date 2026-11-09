import { slugify } from './slug.util';

describe('slugify', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(slugify('Điện Thoại')).toBe('dien-thoai');
  });
  it('đ/Đ -> d', () => {
    expect(slugify('Đồng Hồ')).toBe('dong-ho');
  });
  it('bỏ ký tự đặc biệt + gộp gạch', () => {
    expect(slugify('iPhone 13 Pro Max!!')).toBe('iphone-13-pro-max');
  });
  it('cắt gạch ở hai đầu', () => {
    expect(slugify('  --Hello World--  ')).toBe('hello-world');
  });
});
