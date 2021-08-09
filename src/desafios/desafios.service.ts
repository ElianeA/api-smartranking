import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JogadoresService } from 'src/jogadores/jogadores.service';
import { CategoriasService } from 'src/categorias/categorias.service';
import { CriarDesafioDto } from './dtos/criar-desafio.dto';
import { DesafioStatus } from './interfaces/desafio-status.enum';
import { Desafio, Partida } from './interfaces/desafio.interface';
import { AtualizarDesafioDto } from './dtos/atualizar-dasafio.dto';
import { AtribuirDesafioPartidaDto } from './dtos/atribuir-dasafio-partida.dto';

@Injectable()
export class DesafiosService {
  constructor(
    @InjectModel('Desafio') private readonly desafioModel: Model<Desafio>,
    @InjectModel('Partida') private readonly partidaModel: Model<Partida>,
    private readonly jogadoresService: JogadoresService,
    private readonly categoriasService: CategoriasService,
  ) {}

  private readonly logger = new Logger(DesafiosService.name);
  async criarDesafio(criarDesafioDto: CriarDesafioDto): Promise<Desafio> {
    // verificar se os jogadores informados estão cadastrados
    const jogadores = await this.jogadoresService.consultarTodosJogadores();

    criarDesafioDto.jogadores.map((jogadorDto) => {
      const jogadorFilter = jogadores.filter(
        (jogador) => jogador._id == jogadorDto._id,
      );

      if (jogadorFilter.length == 0) {
        throw new BadRequestException(`O id ${jogadorDto._id} não éum jogador`);
      }
    });

    // Verificar se o solicitante é um dos jogadoresda partida
    const solicitanteEhJogadorDaPartida =
      await criarDesafioDto.jogadores.filter(
        (jogador) => jogador._id == criarDesafioDto.solicitante,
      );
    this.logger.log(
      `solicitanteEhJogadorDaPartida: ${solicitanteEhJogadorDaPartida}`,
    );

    if (solicitanteEhJogadorDaPartida.length == 0) {
      throw new BadRequestException(
        `O solicitante ${solicitanteEhJogadorDaPartida} não é um jogador da partida! Solicitante deve ser jogador da partida`,
      );
    }
    //Descobrir a categoria com base no ID do jogador solicitante
    const categoriaDoJogador =
      await this.categoriasService.consultarCategoriaDoJogador(
        criarDesafioDto.solicitante,
      );

    //O solicitante deve fazer parte de uma categoria

    if (!categoriaDoJogador) {
      throw new BadRequestException(
        `O solicitante ${solicitanteEhJogadorDaPartida} não está registrado em uma categoria! O solicitante deve está registradoa uma categoria`,
      );
    }

    const desafioCriado = new this.desafioModel(criarDesafioDto);
    desafioCriado.categoria = categoriaDoJogador.categoria;
    desafioCriado.dataHoraSolicitcao = new Date();
    this.logger.log(
      `desafioCriado.dataHoraSolicitacao: ${desafioCriado.dataHoraSolicitcao}`,
    );

    //Quando o desafio é criado, definimos o status como pendente
    desafioCriado.status = DesafioStatus.PENDENTE;
    this.logger.log(`desafioCriado: ${JSON.stringify(desafioCriado)}`);
    return await desafioCriado.save();
  }

  async consultarTodosDesafios(): Promise<Array<Desafio>> {
    return await this.desafioModel
      .find()
      .populate('solicitante')
      .populate('jogadores')
      .populate('partida')
      .exec();
  }

  async consultarDesafiosDeUmJogador(_id: any): Promise<Array<Desafio>> {
    const jogadores = await this.jogadoresService.consultarTodosJogadores();
    const jogadorFilter = jogadores.filter((jogador) => jogador._id == _id);
    if (jogadorFilter.length == 0) {
      throw new BadRequestException(`O id ${_id} não é um jogador!`);
    }

    return await this.desafioModel
      .find()
      .where('jogadores')
      .in(_id)
      .populate('solicitante')
      .populate('jogadores')
      .populate('partida')
      .exec();
  }

  async atualizarDesafio(
    _id: string,
    atualizarDesafioDto: AtualizarDesafioDto,
  ): Promise<void> {
    const desafioEncontrado = await this.desafioModel.findById(_id).exec();
    if (!desafioEncontrado) {
      throw new NotFoundException(`Desafio ${_id} não cadastrado!`);
    }

    //Atualizaremos a data da resposta quando o status do desafio vier preenchido

    if (atualizarDesafioDto.status) {
      desafioEncontrado.dataHoraResposta = new Date();
    }
    desafioEncontrado.status = atualizarDesafioDto.status;
    desafioEncontrado.dataHoraDesafio = atualizarDesafioDto.dataHoraDesafio;

    await this.desafioModel
      .findOneAndUpdate({ _id }, { $set: desafioEncontrado })
      .exec();
  }

  async atribuirDesafioPartida(
    _id: string,
    atribuirDesafioPartidaDto: AtribuirDesafioPartidaDto,
  ): Promise<void> {
    const desafioEncontrado = await this.desafioModel.findById(_id).exec();
    if (!desafioEncontrado) {
      throw new BadRequestException(`Desafio ${_id} não cadastrado!`);
    }

    // Verifica se o jogador vencedor faz parte do desafio

    const jogadorFilter = desafioEncontrado.jogadores.filter(
      (jogador) => jogador._id == atribuirDesafioPartidaDto.def,
    );
    this.logger.log(`desafioEncontrado: ${desafioEncontrado}`);
    this.logger.log(`jogadorFilter: ${jogadorFilter}`);

    if (jogadorFilter.length == 0) {
      throw new BadRequestException(
        `O jogador vencedor não faz parte do desafio!`,
      );
    }

    // Cria e persistir o objeto partida
    const partidaCriada = new this.partidaModel(atribuirDesafioPartidaDto);
    // Atribui ao objeto partida a categoria recuperada no desafio
    partidaCriada.categoria = desafioEncontrado.categoria;
    // Atribui ao objeto partida os jogadores que fizeram parte do desafio
    partidaCriada.jogadores = desafioEncontrado.jogadores;
    const resultado = await partidaCriada.save();
    // status do desafio muda para realizado quando uma partida for registrada por um usuário
    desafioEncontrado.status = DesafioStatus.REALIZADO;
    // Recupera o Id da partiba e atribui ao desafio
    desafioEncontrado.partida = resultado._id;
    try {
      await this.desafioModel
        .findOneAndUpdate({ _id }, { $set: desafioEncontrado })
        .exec();
    } catch (error) {
      //Se atualização do desafio falhar excluímos a partida que foi gravada anteriormente
      await this.partidaModel.deleteOne({ _id: resultado._id }).exec();
      throw new InternalServerErrorException();
    }
  }

  async deletarDesafio(_id: string): Promise<void> {
    const desafioEncontrado = await this.desafioModel.findById(_id).exec();

    if (!desafioEncontrado) {
      throw new BadRequestException(`Desafio ${_id} não cadastrado!`);
    }

    // Deleta o desafio e modifica o seu estado para cancelado
    desafioEncontrado.status = DesafioStatus.CANCELADO;

    await this.desafioModel
      .findOneAndUpdate({ _id }, { $set: desafioEncontrado })
      .exec();
  }
}
