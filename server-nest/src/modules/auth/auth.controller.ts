import {
  Body,
  Controller,
  Get,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: '注册（自动绑定 common 空间为 OWNER）' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: FastifyReply) {
    const r = await this.auth.register(dto);
    res.setCookie(r.cookie.name, r.cookie.value, r.cookie.options);
    return { user: r.user };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: '登录（httpOnly cookie 写 JWT）' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: FastifyReply) {
    const r = await this.auth.login(dto);
    res.setCookie(r.cookie.name, r.cookie.value, r.cookie.options);
    return { user: r.user };
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: '当前登录用户 + 所在空间' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('logout')
  @ApiCookieAuth()
  @ApiOperation({ summary: '登出（清 cookie）' })
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    return this.auth.logout(res);
  }

  @Get('ws-token')
  @ApiCookieAuth()
  @ApiOperation({
    summary: '签发短期 WS 鉴权 token（5 分钟）',
    description: 'httpOnly cookie 在跨域 WS 握手中不会被浏览器带，前端用此 token 拼到 ws url 的 query 上',
  })
  wsToken(@CurrentUser() user: AuthUser) {
    return this.auth.issueWsToken(user);
  }
}
